/**
 * POST /api/upload — recibe un PDF, lo guarda en Storage, crea la fila
 * en `documents` y dispara la ingesta.
 *
 * Codex: implementar siguiendo las reglas de seguridad de AGENTS.md:
 * - Validar mime-type y tamaño en server
 * - Path en storage: <user_id>/<doc_id>.pdf
 * - Disparar ingestDocument(doc.id) en background; no esperar a que termine
 *   (la UI hará polling de /api/documents/[id]/status).
 */

import { createClient } from '@/lib/supabase/server';
import { ingestDocument } from '@/lib/ai/ingest';
import { AI_CONFIG } from '@/lib/ai/config';

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return Response.json({ error: 'Falta archivo' }, { status: 400 });
  }

  if (file.type !== 'application/pdf') {
    return Response.json({ error: 'Solo se aceptan PDFs' }, { status: 400 });
  }

  if (file.size > AI_CONFIG.limits.maxUploadBytes) {
    return Response.json(
      { error: `Tamaño máximo ${AI_CONFIG.limits.maxUploadBytes} bytes` },
      { status: 413 }
    );
  }

  // TODO Codex: completar:
  //
  // 1) Crear fila en documents con status='pending', size_bytes=file.size, title=file.name
  // 2) storage_path = `${user.id}/${doc.id}.pdf`
  // 3) Subir el archivo: supabase.storage.from('documents').upload(storage_path, file, { contentType: 'application/pdf' })
  // 4) Si falla la subida, borrar la fila de documents y devolver error
  // 5) UPDATE documents SET storage_path = ... WHERE id = doc.id
  // 6) Disparar ingesta en background: void ingestDocument(doc.id).catch(err => console.error('[api/upload] ingest', err))
  // 7) Devolver { document_id: doc.id }

  return Response.json({ error: 'No implementado' }, { status: 501 });
}
