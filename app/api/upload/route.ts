import { z } from 'zod';
import { AI_CONFIG } from '@/lib/ai/config';
import { ingestDocument } from '@/lib/ai/ingest';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const uploadSchema = z.object({
  file: z
    .instanceof(File, { message: 'Falta archivo' })
    .refine((file) => file.type === 'application/pdf', {
      message: 'Solo se aceptan PDFs',
    })
    .refine((file) => file.size <= AI_CONFIG.limits.maxUploadBytes, {
      message: `Tamano maximo ${AI_CONFIG.limits.maxUploadBytes} bytes`,
    }),
});

const titleSchema = z.string().trim().min(1).max(255);
const PDF_SIGNATURE = '%PDF-';

async function hasPdfSignature(file: File) {
  const header = await file.slice(0, PDF_SIGNATURE.length).arrayBuffer();
  return new TextDecoder().decode(header) === PDF_SIGNATURE;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (error) {
    console.error('[api/upload] formData', error);
    return Response.json({ error: 'Formulario invalido' }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse({ file: formData.get('file') });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Archivo invalido';
    const status = message.startsWith('Tamano') ? 413 : 400;
    return Response.json({ error: message }, { status });
  }

  const { file } = parsed.data;
  if (!(await hasPdfSignature(file))) {
    return Response.json({ error: 'Solo se aceptan PDFs validos' }, { status: 400 });
  }

  const documentId = crypto.randomUUID();
  const storagePath = `${user.id}/${documentId}.pdf`;
  const titleResult = titleSchema.safeParse(file.name);
  const title = titleResult.success ? titleResult.data : 'document.pdf';

  const { error: insertError } = await supabase.from('documents').insert({
    id: documentId,
    user_id: user.id,
    title,
    storage_path: storagePath,
    size_bytes: file.size,
    status: 'pending',
  });

  if (insertError) {
    console.error('[api/upload] insert', insertError);
    return Response.json({ error: 'Error al crear documento' }, { status: 500 });
  }

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    console.error('[api/upload] storage upload', uploadError);

    const { error: cleanupError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (cleanupError) {
      console.error('[api/upload] cleanup document', cleanupError);
    }

    return Response.json({ error: 'Error al subir PDF' }, { status: 500 });
  }

  void ingestDocument(documentId).catch((error) => {
    console.error('[api/upload] ingest', error);
  });

  return Response.json({ document_id: documentId });
}

export const __uploadTestUtils = {
  hasPdfSignature,
};
