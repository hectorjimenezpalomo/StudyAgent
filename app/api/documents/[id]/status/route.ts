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

export async function GET(_req: Request, context: RouteContext) {
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

  const { data: document, error } = await supabase
    .from('documents')
    .select('status, error_message')
    .eq('id', parsedParams.data.id)
    .maybeSingle();

  if (error) {
    console.error('[api/documents/:id/status] select', error);
    return Response.json({ error: 'Error al cargar estado' }, { status: 500 });
  }

  if (!document) {
    return Response.json({ error: 'Documento no encontrado' }, { status: 404 });
  }

  return Response.json({
    status: document.status,
    error_message: document.error_message,
  });
}
