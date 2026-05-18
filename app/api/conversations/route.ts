import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

type ConversationRow = Pick<
  Tables<'conversations'>,
  'id' | 'title' | 'created_at' | 'updated_at'
>;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[api/conversations] list', error);
    return Response.json({ error: 'Error al cargar conversaciones' }, { status: 500 });
  }

  return Response.json((data ?? []) as ConversationRow[]);
}
