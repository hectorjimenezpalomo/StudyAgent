/**
 * Wrapper que reproduce el pipeline de RAG sobre una sola pregunta, separando
 * las etapas para poder medir cada una.
 *
 * IMPORTANTE: estamos midiendo el RAG core (embed → retrieval → generation),
 * no el agente con tool calling. La decisión de cuándo llamar a `search_documents`
 * pertenece a un eval distinto (futuro: A1.bis "agent decision eval").
 */

import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_CONFIG } from '../lib/ai/config';
import { embedQuery } from '../lib/ai/embeddings';
import { buildRagPrompt } from '../lib/ai/prompts';

export interface RetrievedChunk {
  id: string;
  content: string;
  page_number: number | null;
  similarity: number;
}

export interface PipelineResult {
  retrieved: RetrievedChunk[];
  answer: string;
  contextText: string;
  retrieval_ms: number;
  generation_ms: number;
}

interface MatchChunksRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  page_number: number | null;
  similarity: number;
}

function serializeEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

function chunksToContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk, index) =>
        `[Fuente ${index + 1}${chunk.page_number ? `, página ${chunk.page_number}` : ''}]\n${chunk.content}`
    )
    .join('\n\n---\n\n');
}

export async function runPipeline(
  supabase: SupabaseClient,
  userId: string,
  question: string,
  documentIds: string[]
): Promise<PipelineResult> {
  const tRetrievalStart = Date.now();
  const embedding = await embedQuery(question);
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: serializeEmbedding(embedding),
    match_threshold: AI_CONFIG.rag.matchThreshold,
    match_count: AI_CONFIG.rag.matchCount,
    p_user_id: userId,
    p_document_ids: documentIds,
  });
  const retrieval_ms = Date.now() - tRetrievalStart;

  if (error) {
    throw new Error(`[evals/pipeline] match_chunks failed: ${error.message}`);
  }

  const rows = (data ?? []) as MatchChunksRow[];
  const retrieved: RetrievedChunk[] = rows.map((row) => ({
    id: row.id,
    content: row.content,
    page_number: row.page_number,
    similarity: row.similarity,
  }));

  const contextText = chunksToContext(retrieved);

  const tGenStart = Date.now();
  const { text } = await generateText({
    model: openai(AI_CONFIG.chatModel),
    prompt: buildRagPrompt(question, retrieved),
    maxTokens: AI_CONFIG.agent.maxTokensPerResponse,
  });
  const generation_ms = Date.now() - tGenStart;

  return {
    retrieved,
    answer: text,
    contextText,
    retrieval_ms,
    generation_ms,
  };
}
