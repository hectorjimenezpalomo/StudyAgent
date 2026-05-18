import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_req: Request, context: RouteContext) {
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return Response.json({ error: 'Id de documento invalido' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: document, error: selectError } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', parsedParams.data.id)
    .maybeSingle();

  if (selectError) {
    console.error('[api/documents/:id] select', selectError);
    return Response.json({ error: 'Error al cargar documento' }, { status: 500 });
  }

  if (!document) {
    return Response.json({ error: 'Documento no encontrado' }, { status: 404 });
  }

  const { error: storageError } = await supabase.storage
    .from('documents')
    .remove([document.storage_path]);

  if (storageError) {
    console.error('[api/documents/:id] storage remove', storageError);
    return Response.json({ error: 'Error al borrar archivo' }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', document.id);

  if (deleteError) {
    console.error('[api/documents/:id] delete', deleteError);
    return Response.json({ error: 'Error al borrar documento' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
