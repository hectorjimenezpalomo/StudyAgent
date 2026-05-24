/**
 * Capa de recuperación. Aísla al resto del código de saber qué algoritmo
 * (vector puro vs hybrid + RRF) se está usando.
 *
 * - `mode='vector'`: llama a `match_chunks` (pgvector, threshold).
 * - `mode='hybrid'`: llama a `match_chunks_hybrid` (pgvector + BM25 fusionados
 *   server-side con Reciprocal Rank Fusion). Requiere migración 004.
 *
 * Cualquier ranker nuevo (reranking de cross-encoder, HyDE, etc.) debe
 * entrar por aquí y devolver `ChunkResult[]` para mantener la interfaz
 * estable hacia tools.ts y evals/pipeline.ts.
 */

import { AI_CONFIG, type RetrievalMode } from './config';
import { embedQuery } from './embeddings';
import type { ChunkResult } from '@/types';

type DbError = { message: string };
type QueryResult<T> = { data: T | null; error: DbError | null };

type MatchChunksArgs = {
  query_embedding: string;
  match_threshold: number;
  match_count: number;
  p_user_id: string;
  p_document_ids: string[];
};

type MatchChunksHybridArgs = {
  query_text: string;
  query_embedding: string;
  match_count: number;
  candidate_multiplier: number;
  rrf_k: number;
  p_user_id: string;
  p_document_ids: string[];
};

type HybridRow = ChunkResult & { rrf_score?: number };

export interface RetrievalSupabase {
  rpc(name: 'match_chunks', args: MatchChunksArgs): PromiseLike<QueryResult<ChunkResult[]>>;
  rpc(name: 'match_chunks_hybrid', args: MatchChunksHybridArgs): PromiseLike<QueryResult<HybridRow[]>>;
}

export interface RetrieveOptions {
  query: string;
  userId: string;
  documentIds: string[];
  topK: number;
  mode?: RetrievalMode;
}

function serializeEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export async function retrieve(
  supabase: RetrievalSupabase,
  opts: RetrieveOptions
): Promise<ChunkResult[]> {
  const mode = opts.mode ?? AI_CONFIG.rag.retrievalMode;

  if (opts.documentIds.length === 0) {
    return [];
  }

  const embedding = await embedQuery(opts.query);
  const serializedEmbedding = serializeEmbedding(embedding);

  if (mode === 'hybrid') {
    const { data, error } = await supabase.rpc('match_chunks_hybrid', {
      query_text: opts.query,
      query_embedding: serializedEmbedding,
      match_count: opts.topK,
      candidate_multiplier: AI_CONFIG.rag.hybridCandidateMultiplier,
      rrf_k: AI_CONFIG.rag.hybridRRFConstant,
      p_user_id: opts.userId,
      p_document_ids: opts.documentIds,
    });

    if (error) {
      console.error('[ai/retrieval] match_chunks_hybrid', error);
      throw new Error(`match_chunks_hybrid failed: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      document_id: row.document_id,
      content: row.content,
      chunk_index: row.chunk_index,
      page_number: row.page_number,
      similarity: row.similarity,
    }));
  }

  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: serializedEmbedding,
    match_threshold: AI_CONFIG.rag.matchThreshold,
    match_count: opts.topK,
    p_user_id: opts.userId,
    p_document_ids: opts.documentIds,
  });

  if (error) {
    console.error('[ai/retrieval] match_chunks', error);
    throw new Error(`match_chunks failed: ${error.message}`);
  }

  return data ?? [];
}
