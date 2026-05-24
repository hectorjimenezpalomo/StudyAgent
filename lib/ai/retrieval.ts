/**
 * Capa de recuperación. Aísla al resto del código de saber qué algoritmo
 * (vector puro vs hybrid + RRF, con o sin reranker) se está usando.
 *
 * Pipeline:
 *   embed → fetch N candidatos (N = topK o topK * rerankPoolMultiplier)
 *         → [opcional] rerank a topK
 *
 * Modos de retrieval:
 * - `mode='vector'`: `match_chunks` (pgvector + threshold).
 * - `mode='hybrid'`: `match_chunks_hybrid` (pgvector + BM25 fusionados RRF
 *   server-side). Requiere migración 004.
 *
 * Reranker (post-retrieval):
 * - `null`: sin reranker, devuelve los topK del retrieval directamente.
 * - instancia: over-fetch, rerank, slice a topK. Fallback graceful a orden
 *   original truncado si el reranker lanza.
 *
 * Defaults vienen de `AI_CONFIG.rag.{retrievalMode, rerankProvider}`. Tests
 * inyectan reranker explícito (incluido `null` para forzar desactivar).
 */

import { AI_CONFIG, type RetrievalMode } from './config';
import { embedQuery } from './embeddings';
import { createReranker, type Reranker } from './rerank';
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
  /**
   * Override del reranker:
   * - `undefined` (no pasado): deriva de `AI_CONFIG.rag.rerankProvider`.
   * - `null`: fuerza desactivar reranking.
   * - instancia: usa ese reranker.
   */
  reranker?: Reranker | null;
}

function serializeEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

function deriveReranker(opts: RetrieveOptions): Reranker | null {
  if (opts.reranker !== undefined) return opts.reranker;
  if (AI_CONFIG.rag.rerankProvider === 'none') return null;
  return createReranker(AI_CONFIG.rag.rerankProvider);
}

async function fetchVector(
  supabase: RetrievalSupabase,
  serializedEmbedding: string,
  opts: RetrieveOptions,
  matchCount: number
): Promise<ChunkResult[]> {
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: serializedEmbedding,
    match_threshold: AI_CONFIG.rag.matchThreshold,
    match_count: matchCount,
    p_user_id: opts.userId,
    p_document_ids: opts.documentIds,
  });

  if (error) {
    console.error('[ai/retrieval] match_chunks', error);
    throw new Error(`match_chunks failed: ${error.message}`);
  }
  return data ?? [];
}

async function fetchHybrid(
  supabase: RetrievalSupabase,
  serializedEmbedding: string,
  opts: RetrieveOptions,
  matchCount: number
): Promise<ChunkResult[]> {
  const { data, error } = await supabase.rpc('match_chunks_hybrid', {
    query_text: opts.query,
    query_embedding: serializedEmbedding,
    match_count: matchCount,
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

export async function retrieve(
  supabase: RetrievalSupabase,
  opts: RetrieveOptions
): Promise<ChunkResult[]> {
  if (opts.documentIds.length === 0) {
    return [];
  }

  const mode = opts.mode ?? AI_CONFIG.rag.retrievalMode;
  const reranker = deriveReranker(opts);
  const fetchCount =
    reranker !== null
      ? opts.topK * AI_CONFIG.rag.rerankCandidatePoolMultiplier
      : opts.topK;

  const embedding = await embedQuery(opts.query);
  const serializedEmbedding = serializeEmbedding(embedding);

  const chunks =
    mode === 'hybrid'
      ? await fetchHybrid(supabase, serializedEmbedding, opts, fetchCount)
      : await fetchVector(supabase, serializedEmbedding, opts, fetchCount);

  if (reranker === null) {
    return chunks;
  }

  try {
    const reranked = await reranker.rerank({
      query: opts.query,
      documents: chunks.map((c) => ({ id: c.id, content: c.content })),
      topK: opts.topK,
    });
    const byId = new Map(chunks.map((c) => [c.id, c]));
    const ordered: ChunkResult[] = [];
    for (const r of reranked) {
      const chunk = byId.get(r.id);
      if (chunk) ordered.push(chunk);
    }
    return ordered;
  } catch (err) {
    console.error('[ai/retrieval] reranker fallback', err);
    return chunks.slice(0, opts.topK);
  }
}
