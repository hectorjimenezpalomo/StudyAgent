import { z } from 'zod';
import { messageRowToUiMessage } from '@/lib/chat/persistence';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

type ConversationRow = Pick<
  Tables<'conversations'>,
  'id' | 'title' | 'created_at' | 'updated_at'
>;
type MessageRow = Tables<'messages'>;

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return Response.json({ error: 'ID invalido' }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('id', parsed.data.id)
    .single();

  if (conversationError || !conversation) {
    console.error('[api/conversations] detail conversation', conversationError);
    return Response.json({ error: 'Conversacion no encontrada' }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', parsed.data.id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('[api/conversations] detail messages', messagesError);
    return Response.json({ error: 'Error al cargar mensajes' }, { status: 500 });
  }

  return Response.json({
    conversation: conversation as ConversationRow,
    messages: ((messages ?? []) as MessageRow[])
      .map(messageRowToUiMessage)
      .filter((message) => message !== null),
  });
}
