import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { embedQuery } from '../embeddings';
import { retrieve, type RetrievalSupabase } from '../retrieval';
import type { Reranker } from '../rerank';
import { AI_CONFIG } from '../config';

vi.mock('../embeddings', () => ({
  embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '22222222-2222-4222-8222-222222222222';
const CHUNK_ID = '33333333-3333-4333-8333-333333333333';

function createSupabaseMock(
  options: {
    rpcResponse?: { data: unknown[]; error: { message: string } | null };
  } = {}
): { supabase: RetrievalSupabase; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => ({
    data: options.rpcResponse?.data ?? [
      {
        id: CHUNK_ID,
        document_id: DOC_ID,
        content: 'Contenido recuperado',
        chunk_index: 0,
        page_number: null,
        similarity: 0.9,
      },
    ],
    error: options.rpcResponse?.error ?? null,
  }));

  return { supabase: { rpc } as unknown as RetrievalSupabase, rpc };
}

describe('retrieve()', () => {
  beforeEach(() => {
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve [] sin llamar a embed ni rpc si no hay documentos', async () => {
    const { supabase, rpc } = createSupabaseMock();

    const result = await retrieve(supabase, {
      query: 'algo',
      userId: USER_ID,
      documentIds: [],
      topK: 8,
      mode: 'vector',
    });

    expect(result).toEqual([]);
    expect(embedQuery).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('mode=vector llama a match_chunks con args legacy', async () => {
    const { supabase, rpc } = createSupabaseMock();

    await retrieve(supabase, {
      query: 'topic',
      userId: USER_ID,
      documentIds: [DOC_ID],
      topK: 5,
      mode: 'vector',
    });

    expect(rpc).toHaveBeenCalledWith('match_chunks', {
      query_embedding: '[0.1,0.2,0.3]',
      match_threshold: AI_CONFIG.rag.matchThreshold,
      match_count: 5,
      p_user_id: USER_ID,
      p_document_ids: [DOC_ID],
    });
  });

  it('mode=hybrid llama a match_chunks_hybrid con query_text, multiplier y rrf_k', async () => {
    const { supabase, rpc } = createSupabaseMock();

    await retrieve(supabase, {
      query: 'descenso del gradiente',
      userId: USER_ID,
      documentIds: [DOC_ID],
      topK: 8,
      mode: 'hybrid',
    });

    expect(rpc).toHaveBeenCalledWith('match_chunks_hybrid', {
      query_text: 'descenso del gradiente',
      query_embedding: '[0.1,0.2,0.3]',
      match_count: 8,
      candidate_multiplier: AI_CONFIG.rag.hybridCandidateMultiplier,
      rrf_k: AI_CONFIG.rag.hybridRRFConstant,
      p_user_id: USER_ID,
      p_document_ids: [DOC_ID],
    });
  });

  it('mode=hybrid normaliza filas con rrf_score extra a ChunkResult', async () => {
    const { supabase } = createSupabaseMock({
      rpcResponse: {
        data: [
          {
            id: CHUNK_ID,
            document_id: DOC_ID,
            content: 'Contenido hybrid',
            chunk_index: 2,
            page_number: 7,
            similarity: 0.42,
            rrf_score: 0.0312,
          },
        ],
        error: null,
      },
    });

    const result = await retrieve(supabase, {
      query: 'q',
      userId: USER_ID,
      documentIds: [DOC_ID],
      topK: 8,
      mode: 'hybrid',
    });

    expect(result).toEqual([
      {
        id: CHUNK_ID,
        document_id: DOC_ID,
        content: 'Contenido hybrid',
        chunk_index: 2,
        page_number: 7,
        similarity: 0.42,
      },
    ]);
  });

  it('propaga error del RPC como Error tipado', async () => {
    const { supabase } = createSupabaseMock({
      rpcResponse: { data: [], error: { message: 'boom' } },
    });

    await expect(
      retrieve(supabase, {
        query: 'q',
        userId: USER_ID,
        documentIds: [DOC_ID],
        topK: 8,
        mode: 'vector',
      })
    ).rejects.toThrow(/boom/);
  });

  it('usa el mode del config cuando no se pasa explícito', async () => {
    const { supabase, rpc } = createSupabaseMock();

    await retrieve(supabase, {
      query: 'q',
      userId: USER_ID,
      documentIds: [DOC_ID],
      topK: 8,
    });

    const [calledName] = rpc.mock.calls[0];
    expect(calledName).toBe(AI_CONFIG.rag.retrievalMode === 'hybrid' ? 'match_chunks_hybrid' : 'match_chunks');
  });

  it('reranker=null fuerza desactivar y mantiene match_count = topK', async () => {
    const { supabase, rpc } = createSupabaseMock();

    await retrieve(supabase, {
      query: 'q',
      userId: USER_ID,
      documentIds: [DOC_ID],
      topK: 3,
      mode: 'vector',
      reranker: null,
    });

    expect(rpc).toHaveBeenCalledWith(
      'match_chunks',
      expect.objectContaining({ match_count: 3 })
    );
  });

  it('con reranker inyectado: over-fetch a topK*multiplier y reordena por su salida', async () => {
    const { supabase, rpc } = createSupabaseMock({
      rpcResponse: {
        data: [
          { id: 'a', document_id: DOC_ID, content: 'a', chunk_index: 0, page_number: null, similarity: 0.9 },
          { id: 'b', document_id: DOC_ID, content: 'b', chunk_index: 1, page_number: null, similarity: 0.8 },
          { id: 'c', document_id: DOC_ID, content: 'c', chunk_index: 2, page_number: null, similarity: 0.7 },
        ],
        error: null,
      },
    });

    const rerankFn = vi.fn(async () => [
      { id: 'b', rerank_score: 9 },
      { id: 'a', rerank_score: 5 },
    ]);
    const reranker: Reranker = { rerank: rerankFn };

    const result = await retrieve(supabase, {
      query: 'q',
      userId: USER_ID,
      documentIds: [DOC_ID],
      topK: 2,
      mode: 'vector',
      reranker,
    });

    expect(rpc).toHaveBeenCalledWith(
      'match_chunks',
      expect.objectContaining({
        match_count: 2 * AI_CONFIG.rag.rerankCandidatePoolMultiplier,
      })
    );
    expect(rerankFn).toHaveBeenCalledWith({
      query: 'q',
      documents: [
        { id: 'a', content: 'a' },
        { id: 'b', content: 'b' },
        { id: 'c', content: 'c' },
      ],
      topK: 2,
    });
    expect(result.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('si el reranker lanza, fallback al orden de retrieval truncado a topK', async () => {
    const { supabase } = createSupabaseMock({
      rpcResponse: {
        data: [
          { id: 'a', document_id: DOC_ID, content: 'a', chunk_index: 0, page_number: null, similarity: 0.9 },
          { id: 'b', document_id: DOC_ID, content: 'b', chunk_index: 1, page_number: null, similarity: 0.8 },
          { id: 'c', document_id: DOC_ID, content: 'c', chunk_index: 2, page_number: null, similarity: 0.7 },
        ],
        error: null,
      },
    });

    const reranker: Reranker = {
      rerank: vi.fn(async () => {
        throw new Error('rerank down');
      }),
    };

    const result = await retrieve(supabase, {
      query: 'q',
      userId: USER_ID,
      documentIds: [DOC_ID],
      topK: 2,
      mode: 'vector',
      reranker,
    });

    expect(result.map((c) => c.id)).toEqual(['a', 'b']);
  });
});
