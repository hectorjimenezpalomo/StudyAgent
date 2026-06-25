import { openai } from '@ai-sdk/openai';
import { convertToCoreMessages, createDataStreamResponse, formatDataStreamPart, streamText } from 'ai';
import { z } from 'zod';
import { AI_CONFIG } from '@/lib/ai/config';
import { SYSTEM_PROMPT_AGENT } from '@/lib/ai/prompts';
import { createAgentTools, type AgentToolContext } from '@/lib/ai/tools';
import {
  getConversationPromptMessages,
  getOrCreateConversation,
  persistChatMessage,
  touchConversation,
} from '@/lib/chat/persistence';
import { recordUserTrace } from '@/lib/observability/traces';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

export const maxDuration = 60;

type DocumentRow = Pick<Tables<'documents'>, 'id' | 'title'>;

const MAX_CHAT_REQUEST_BYTES = 100_000;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_CLIENT_MESSAGES = 100;

const messageSchema = z
  .object({
    // Client messages are used only to identify the latest user input. The
    // actual model history is rebuilt from persisted messages below.
    role: z.enum(['user', 'assistant', 'data']),
    content: z.string().max(MAX_MESSAGE_CHARS).optional(),
    parts: z
      .array(
        z
          .object({
            type: z.string().max(64),
            text: z.string().max(MAX_MESSAGE_CHARS).optional(),
          })
          .passthrough()
      )
      .max(20)
      .optional(),
  })
  .passthrough();

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(MAX_CLIENT_MESSAGES),
  document_ids: z.array(z.string().uuid()).max(50).optional(),
  conversation_id: z.string().uuid().optional(),
});

const rateLimitResultSchema = z.array(
  z.object({
    allowed: z.boolean(),
    retry_after_seconds: z.number().int().nonnegative(),
  })
);

const toolResultSchema = z
  .object({
    toolName: z.string(),
  })
  .passthrough();

const retrievalToolResultSchema = z.object({
  chunks: z.array(
    z.object({
      similarity: z.number(),
    })
  ),
});

const NO_READY_DOCUMENTS_MESSAGE =
  'Todavia no tienes documentos listos para consultar. Sube un PDF en Documentos o espera a que termine la ingesta.';

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function createAssistantTextResponse(message: string, conversationId?: string) {
  return createDataStreamResponse({
    headers: conversationId ? { 'x-conversation-id': conversationId } : undefined,
    execute(dataStream) {
      dataStream.write(formatDataStreamPart('text', message));
    },
  });
}

function extractMessageText(message: z.infer<typeof messageSchema>) {
  if (typeof message.content === 'string' && message.content.trim().length > 0) {
    return message.content.trim();
  }

  const textFromParts = message.parts
    ?.map((part) => {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part &&
        typeof part.text === 'string'
      ) {
        return part.text;
      }

      return '';
    })
    .join('');

  return textFromParts?.trim() ?? '';
}

function getLastUserMessage(messages: z.infer<typeof messageSchema>[]) {
  return messages.findLast((message) => message.role === 'user');
}

function summarizeToolResults(value: unknown) {
  const parsed = z.array(toolResultSchema).safeParse(value);
  if (!parsed.success) {
    return { tool_count: 0, tool_names: [] as string[] };
  }

  let retrievedChunkCount = 0;
  const retrievalScores: number[] = [];
  for (const tool of parsed.data) {
    if (tool.toolName !== 'search_documents' || !('result' in tool)) continue;
    const result = retrievalToolResultSchema.safeParse(tool.result);
    if (!result.success) continue;
    retrievedChunkCount += result.data.chunks.length;
    retrievalScores.push(...result.data.chunks.map((chunk) => chunk.similarity));
  }

  return {
    tool_count: parsed.data.length,
    tool_names: [...new Set(parsed.data.map((tool) => tool.toolName))],
    retrieved_chunk_count: retrievedChunkCount,
    average_retrieval_score:
      retrievalScores.length > 0
        ? retrievalScores.reduce((total, score) => total + score, 0) / retrievalScores.length
        : null,
  };
}

function estimateChatCost(inputTokens: number | undefined, outputTokens: number | undefined) {
  return (
    ((inputTokens ?? 0) * AI_CONFIG.observability.chatInputCostUsdPerMillion +
      (outputTokens ?? 0) * AI_CONFIG.observability.chatOutputCostUsdPerMillion) /
    1_000_000
  );
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_CHAT_REQUEST_BYTES) {
    return Response.json({ error: 'Body demasiado grande' }, { status: 413 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch (error) {
    console.error('[api/chat] json', error);
    return Response.json({ error: 'Body invalido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Body invalido' }, { status: 400 });
  }

  const {
    messages,
    document_ids: requestedDocumentIds,
    conversation_id: requestedConversationId,
  } = parsed.data;
  const lastUserMessage = getLastUserMessage(messages);
  const question = lastUserMessage ? extractMessageText(lastUserMessage) : '';

  if (!question) {
    return Response.json({ error: 'Falta mensaje de usuario' }, { status: 400 });
  }

  const { data: rateLimitData, error: rateLimitError } = await supabase.rpc(
    'consume_chat_rate_limit',
    {
      p_limit: AI_CONFIG.limits.chatRequestsPerMinute,
      p_window_seconds: 60,
    }
  );
  if (rateLimitError) {
    console.error('[api/chat] rate limit', rateLimitError);
    return Response.json({ error: 'Error al comprobar el limite de uso' }, { status: 500 });
  }

  const rateLimit = rateLimitResultSchema.safeParse(rateLimitData ?? []);
  if (!rateLimit.success || !rateLimit.data[0]) {
    console.error('[api/chat] invalid rate limit response', rateLimit.error);
    return Response.json({ error: 'Error al comprobar el limite de uso' }, { status: 500 });
  }
  if (!rateLimit.data[0].allowed) {
    return Response.json(
      { error: 'Has alcanzado el limite temporal de mensajes. Intentalo de nuevo en un minuto.' },
      {
        status: 429,
        headers: { 'retry-after': String(rateLimit.data[0].retry_after_seconds) },
      }
    );
  }

  const conversation = await getOrCreateConversation(
    supabase,
    user.id,
    requestedConversationId,
    question
  );

  if (conversation.error || !conversation.conversationId) {
    return Response.json({ error: conversation.error }, { status: 404 });
  }

  const conversationId = conversation.conversationId;
  const userMessage = await persistChatMessage(supabase, {
    conversationId,
    role: 'user',
    text: question,
  });

  if (!userMessage.ok) {
    return Response.json({ error: userMessage.error }, { status: 500 });
  }

  let readyDocumentsQuery = supabase
    .from('documents')
    .select('id, title')
    .eq('status', 'ready');

  if (requestedDocumentIds && requestedDocumentIds.length > 0) {
    readyDocumentsQuery = readyDocumentsQuery.in('id', requestedDocumentIds);
  }

  const { data: readyDocuments, error: readyDocumentsError } =
    await readyDocumentsQuery;

  if (readyDocumentsError) {
    console.error('[api/chat] ready documents', readyDocumentsError);
    return Response.json({ error: 'Error al cargar documentos' }, { status: 500 });
  }

  const readyDocumentIds = ((readyDocuments ?? []) as DocumentRow[]).map(
    (document) => document.id
  );

  if (readyDocumentIds.length === 0) {
    console.log(
      `[ai/chat] user=${user.id} messages=${messages.length} chunks=0 model=none estimated_tokens=0`
    );
    await persistChatMessage(supabase, {
      conversationId,
      role: 'assistant',
      text: NO_READY_DOCUMENTS_MESSAGE,
    });
    await touchConversation(supabase, conversationId);
    await recordUserTrace(supabase, {
      requestId,
      userId: user.id,
      conversationId,
      stage: 'chat',
      status: 'ok',
      latencyMs: Date.now() - startedAt,
      metadata: { documents_ready: 0, response_kind: 'no_ready_documents' },
    });
    return createAssistantTextResponse(NO_READY_DOCUMENTS_MESSAGE, conversationId);
  }

  const tools = createAgentTools({
    userId: user.id,
    allowedDocumentIds: readyDocumentIds,
    allowedDocuments: (readyDocuments ?? []) as DocumentRow[],
    supabase: supabase as unknown as AgentToolContext['supabase'],
  });

  const promptHistory = await getConversationPromptMessages(supabase, conversationId);
  if (promptHistory.error || !promptHistory.messages) {
    return Response.json({ error: promptHistory.error ?? 'Error al cargar el historial' }, { status: 500 });
  }

  const estimatedTokens = promptHistory.messages.reduce(
    (total, message) => total + estimateTokens(message.content),
    0
  );

  console.log(
    `[ai/chat] user=${user.id} messages=${messages.length} tools=${Object.keys(tools).join(',')} model=${AI_CONFIG.chatModel} estimated_tokens=${estimatedTokens}`
  );

  const result = streamText({
    model: openai(AI_CONFIG.chatModel),
    system: SYSTEM_PROMPT_AGENT,
    messages: convertToCoreMessages(promptHistory.messages),
    tools,
    maxSteps: AI_CONFIG.agent.maxSteps,
    maxTokens: AI_CONFIG.agent.maxTokensPerResponse,
    onFinish: async ({ text, toolCalls, toolResults, usage }) => {
      await persistChatMessage(supabase, {
        conversationId,
        role: 'assistant',
        text,
        toolCalls,
        toolResults,
      });
      await touchConversation(supabase, conversationId);
      const toolSummary = summarizeToolResults(toolResults);
      await recordUserTrace(supabase, {
        requestId,
        userId: user.id,
        conversationId,
        stage: 'chat',
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        model: AI_CONFIG.chatModel,
        inputTokens: usage?.promptTokens,
        outputTokens: usage?.completionTokens,
        estimatedCostUsd: estimateChatCost(usage?.promptTokens, usage?.completionTokens),
        metadata: {
          documents_ready: readyDocumentIds.length,
          ...toolSummary,
        },
      });
    },
  });

  return result.toDataStreamResponse({
    headers: {
      'x-conversation-id': conversationId,
    },
    getErrorMessage(error) {
      console.error('[api/chat] stream', error);
      return 'Error al generar respuesta';
    },
  });
}

export const __chatTestUtils = {
  NO_READY_DOCUMENTS_MESSAGE,
  estimateTokens,
  extractMessageText,
  summarizeToolResults,
  estimateChatCost,
  MAX_CHAT_REQUEST_BYTES,
};
