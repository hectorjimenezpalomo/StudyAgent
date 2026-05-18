import { openai } from '@ai-sdk/openai';
import { convertToCoreMessages, createDataStreamResponse, formatDataStreamPart, streamText } from 'ai';
import { z } from 'zod';
import { AI_CONFIG } from '@/lib/ai/config';
import { embedQuery } from '@/lib/ai/embeddings';
import { buildRagPrompt } from '@/lib/ai/prompts';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

export const maxDuration = 60;

type DocumentRow = Pick<Tables<'documents'>, 'id'>;
type ChunkResult = {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  page_number: number | null;
  similarity: number;
};

const messageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant', 'data']),
    content: z.string().optional(),
    parts: z.array(z.unknown()).optional(),
  })
  .passthrough();

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1),
  document_ids: z.array(z.string().uuid()).optional(),
});

const NO_READY_DOCUMENTS_MESSAGE =
  'Todavia no tienes documentos listos para consultar. Sube un PDF en Documentos o espera a que termine la ingesta.';

const NO_RELEVANT_CHUNKS_MESSAGE =
  'No encuentro informacion relevante sobre eso en tus documentos listos. Prueba a reformular la pregunta o sube mas material.';

function serializeEmbedding(embedding: number[]) {
  return `[${embedding.join(',')}]`;
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function createAssistantTextResponse(message: string) {
  return createDataStreamResponse({
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

export async function POST(req: Request) {
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

  const { messages, document_ids: requestedDocumentIds } = parsed.data;
  const lastUserMessage = getLastUserMessage(messages);
  const question = lastUserMessage ? extractMessageText(lastUserMessage) : '';

  if (!question) {
    return Response.json({ error: 'Falta mensaje de usuario' }, { status: 400 });
  }

  let readyDocumentsQuery = supabase
    .from('documents')
    .select('id')
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
    return createAssistantTextResponse(NO_READY_DOCUMENTS_MESSAGE);
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(question);
  } catch (error) {
    console.error('[api/chat] embed query', error);
    return Response.json({ error: 'Error al embebir la pregunta' }, { status: 500 });
  }

  const { data: chunks, error: chunksError } = await supabase.rpc('match_chunks', {
    query_embedding: serializeEmbedding(queryEmbedding),
    match_threshold: AI_CONFIG.rag.matchThreshold,
    match_count: AI_CONFIG.rag.matchCount,
    p_user_id: user.id,
    p_document_ids: readyDocumentIds,
  });

  if (chunksError) {
    console.error('[api/chat] match_chunks', chunksError);
    return Response.json({ error: 'Error al buscar en documentos' }, { status: 500 });
  }

  const matchedChunks = (chunks ?? []) as ChunkResult[];
  if (matchedChunks.length === 0) {
    console.log(
      `[ai/chat] user=${user.id} messages=${messages.length} chunks=0 model=none estimated_tokens=${estimateTokens(
        question
      )}`
    );
    return createAssistantTextResponse(NO_RELEVANT_CHUNKS_MESSAGE);
  }

  const ragPrompt = buildRagPrompt(question, matchedChunks);
  const promptMessages = [
    ...messages
      .slice(0, -1)
      .filter((message) => ['system', 'user', 'assistant'].includes(message.role))
      .map((message) => ({
        role: message.role as 'system' | 'user' | 'assistant',
        content: extractMessageText(message),
      })),
    { role: 'user' as const, content: ragPrompt },
  ];

  const estimatedTokens =
    estimateTokens(ragPrompt) +
    messages.reduce((total, message) => total + estimateTokens(extractMessageText(message)), 0);

  console.log(
    `[ai/chat] user=${user.id} messages=${messages.length} chunks=${matchedChunks.length} model=${AI_CONFIG.chatModel} estimated_tokens=${estimatedTokens}`
  );

  const result = streamText({
    model: openai(AI_CONFIG.chatModel),
    messages: convertToCoreMessages(promptMessages),
    maxTokens: AI_CONFIG.agent.maxTokensPerResponse,
  });

  return result.toDataStreamResponse({
    getErrorMessage(error) {
      console.error('[api/chat] stream', error);
      return 'Error al generar respuesta';
    },
  });
}

export const __chatTestUtils = {
  NO_READY_DOCUMENTS_MESSAGE,
  NO_RELEVANT_CHUNKS_MESSAGE,
  estimateTokens,
  extractMessageText,
  serializeEmbedding,
};
