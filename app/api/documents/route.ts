/**
 * GET /api/documents — lista los documentos del usuario.
 */

import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[api/documents] GET', error);
    return Response.json({ error: 'Error al cargar documentos' }, { status: 500 });
  }

  return Response.json({ documents: data });
}
