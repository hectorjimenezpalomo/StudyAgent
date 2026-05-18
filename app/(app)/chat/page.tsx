import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ChatInterface } from '@/components/chat/ChatInterface';
import {
  messageRowToUiMessage,
  type ConversationSummary,
  type StoredUiMessage,
} from '@/lib/chat/persistence';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

type MessageRow = Tables<'messages'>;

const searchParamsSchema = z.object({
  conversation_id: z.string().uuid().optional(),
});

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/chat');
  }

  const rawSearchParams = (await searchParams) ?? {};
  const parsedSearchParams = searchParamsSchema.safeParse({
    conversation_id: Array.isArray(rawSearchParams.conversation_id)
      ? rawSearchParams.conversation_id[0]
      : rawSearchParams.conversation_id,
  });
  const activeConversationId = parsedSearchParams.success
    ? parsedSearchParams.data.conversation_id
    : undefined;

  const { data: conversationsData, error: conversationsError } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (conversationsError) {
    console.error('[api/conversations] chat page list', conversationsError);
  }

  let initialMessages: StoredUiMessage[] = [];
  if (activeConversationId) {
    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('[api/conversations] chat page messages', messagesError);
    } else {
      initialMessages = ((messagesData ?? []) as MessageRow[])
        .map(messageRowToUiMessage)
        .filter((message) => message !== null);
    }
  }

  return (
    <div className="flex h-screen min-h-0 flex-col px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-950">Chat</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pregunta, resume, practica y vuelve a hilos anteriores cuando quieras.
        </p>
      </div>
      <ChatInterface
        conversations={(conversationsData ?? []) as ConversationSummary[]}
        initialConversationId={activeConversationId}
        initialMessages={initialMessages}
      />
    </div>
  );
}
