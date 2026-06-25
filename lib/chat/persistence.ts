import type { createClient } from '@/lib/supabase/server';
import type { Json, Tables } from '@/lib/supabase/types';

export type AppSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ConversationSummary = Pick<
  Tables<'conversations'>,
  'id' | 'title' | 'created_at' | 'updated_at'
>;

export type StoredUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  toolInvocations?: Array<{
    toolCallId: string;
    toolName: string;
    args: Json;
    result: Json;
    state: 'result';
  }>;
};

type MessageRow = Tables<'messages'>;
type ToolCallJson = {
  toolCallId: string;
  toolName: string;
  args?: Json;
};
type ToolResultJson = {
  toolCallId: string;
  toolName?: string;
  result?: Json;
};

export function estimateTokensFromText(text: string) {
  return Math.ceil(text.length / 4);
}

export function makeConversationTitle(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) {
    return 'Nuevo chat';
  }

  return clean.length > 64 ? `${clean.slice(0, 61)}...` : clean;
}

export function toJson(value: unknown): Json {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as Json;
}

export function textContent(text: string): Json {
  return [{ type: 'text', text }];
}

export function extractStoredText(content: Json) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (
          part &&
          typeof part === 'object' &&
          !Array.isArray(part) &&
          part.type === 'text' &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }

        return '';
      })
      .join('');
  }

  if (
    content &&
    typeof content === 'object' &&
    !Array.isArray(content) &&
    typeof content.text === 'string'
  ) {
    return content.text;
  }

  return '';
}

function isToolCall(value: Json): value is ToolCallJson {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.toolCallId === 'string' &&
    typeof value.toolName === 'string'
  );
}

function isToolResult(value: Json): value is ToolResultJson {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.toolCallId === 'string'
  );
}

function extractToolInvocations(toolCalls: Json | null) {
  if (!toolCalls || typeof toolCalls !== 'object' || Array.isArray(toolCalls)) {
    return undefined;
  }

  const callsValue = Array.isArray(toolCalls.toolCalls) ? toolCalls.toolCalls : [];
  const resultsValue = Array.isArray(toolCalls.toolResults) ? toolCalls.toolResults : [];
  const calls = callsValue.filter(isToolCall);
  const results = resultsValue.filter(isToolResult);

  if (calls.length === 0) {
    return undefined;
  }

  return calls.map((call) => {
    const result = results.find((item) => item.toolCallId === call.toolCallId);
    return {
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      args: call.args ?? null,
      result: result?.result ?? null,
      state: 'result' as const,
    };
  });
}

export function messageRowToUiMessage(row: MessageRow): StoredUiMessage | null {
  if (row.role !== 'user' && row.role !== 'assistant') {
    return null;
  }

  return {
    id: row.id,
    role: row.role,
    content: extractStoredText(row.content),
    createdAt: new Date(row.created_at),
    toolInvocations: extractToolInvocations(row.tool_calls),
  };
}

export async function getOrCreateConversation(
  supabase: AppSupabaseClient,
  userId: string,
  conversationId: string | undefined,
  titleSource: string
) {
  if (conversationId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .single();

    if (error || !data) {
      console.error('[api/chat] conversation lookup', error);
      return { conversationId: null, error: 'Conversacion no encontrada' };
    }

    return { conversationId: data.id, error: null };
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title: makeConversationTitle(titleSource),
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[api/chat] conversation insert', error);
    return { conversationId: null, error: 'Error al crear conversacion' };
  }

  return { conversationId: data.id, error: null };
}

export async function persistChatMessage(
  supabase: AppSupabaseClient,
  params: {
    conversationId: string;
    role: 'user' | 'assistant';
    text: string;
    toolCalls?: unknown;
    toolResults?: unknown;
  }
) {
  const toolCalls =
    params.toolCalls || params.toolResults
      ? toJson({
          toolCalls: params.toolCalls ?? [],
          toolResults: params.toolResults ?? [],
        })
      : null;

  const { error } = await supabase.from('messages').insert({
    conversation_id: params.conversationId,
    role: params.role,
    content: textContent(params.text),
    tool_calls: toolCalls,
  });

  if (error) {
    console.error('[api/chat] message insert', error);
    return { ok: false, error: 'Error al guardar mensaje' };
  }

  return { ok: true, error: null };
}

export async function touchConversation(
  supabase: AppSupabaseClient,
  conversationId: string
) {
  const { error } = await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) {
    console.error('[api/chat] conversation touch', error);
  }
}

/**
 * Rebuilds model history from RLS-protected persistence instead of trusting a
 * client-supplied assistant or system transcript.
 */
export async function getConversationPromptMessages(
  supabase: AppSupabaseClient,
  conversationId: string
) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[api/chat] prompt history', error);
    return { messages: null, error: 'Error al cargar el historial' };
  }

  const messages = (data ?? [])
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: extractStoredText(message.content),
    }))
    .filter((message) => message.content.trim().length > 0);

  return { messages, error: null };
}
