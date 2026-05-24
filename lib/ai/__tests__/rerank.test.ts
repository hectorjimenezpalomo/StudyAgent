import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateObject } from 'ai';
import { createCohereReranker, createLlmReranker } from '../rerank';

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn((model: string) => ({ model })),
}));

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

describe('llm reranker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve [] sin documentos y no llama al modelo', async () => {
    const reranker = createLlmReranker('gpt-4o-mini');
    const result = await reranker.rerank({ query: 'q', documents: [], topK: 5 });
    expect(result).toEqual([]);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('ordena por score desc y trunca a topK, mapeando índices a ids reales', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        scores: [
          { index: 1, score: 3 },
          { index: 2, score: 9 },
          { index: 3, score: 7 },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const docs = [
      { id: 'a', content: 'doc a' },
      { id: 'b', content: 'doc b' },
      { id: 'c', content: 'doc c' },
    ];
    const reranker = createLlmReranker('gpt-4o-mini');
    const result = await reranker.rerank({ query: 'q', documents: docs, topK: 2 });

    expect(result).toHaveLength(2);
    expect(result[0].rerank_score).toBe(9);
    expect(result[1].rerank_score).toBe(7);
    // El shuffle interno hace que no podamos predecir qué id corresponde a qué
    // índice, pero todos deben venir del set original sin duplicados.
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(['a', 'b', 'c']).toContain(id);
    }
  });

  it('descarta scores con índices fuera de rango', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        scores: [
          { index: 1, score: 5 },
          { index: 99, score: 10 },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const docs = [{ id: 'a', content: 'doc a' }];
    const result = await createLlmReranker('gpt-4o-mini').rerank({
      query: 'q',
      documents: docs,
      topK: 5,
    });
    expect(result).toEqual([{ id: 'a', rerank_score: 5 }]);
  });
});

describe('cohere reranker', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama al endpoint con bearer, modelo y top_n correctos', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { index: 1, relevance_score: 0.92 },
          { index: 0, relevance_score: 0.45 },
        ],
      }),
    });

    const reranker = createCohereReranker({
      apiKey: 'key-123',
      model: 'rerank-test',
    });
    const result = await reranker.rerank({
      query: 'foo',
      documents: [
        { id: 'a', content: 'doc a' },
        { id: 'b', content: 'doc b' },
      ],
      topK: 2,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cohere.com/v2/rerank',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer key-123' }),
      })
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      model: 'rerank-test',
      query: 'foo',
      documents: ['doc a', 'doc b'],
      top_n: 2,
    });

    expect(result).toEqual([
      { id: 'b', rerank_score: 0.92 },
      { id: 'a', rerank_score: 0.45 },
    ]);
  });

  it('lanza si la API responde no-ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });

    const reranker = createCohereReranker({ apiKey: 'k' });
    await expect(
      reranker.rerank({
        query: 'q',
        documents: [{ id: 'a', content: 'a' }],
        topK: 1,
      })
    ).rejects.toThrow(/401/);
  });

  it('valida la shape de la respuesta con zod', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unexpected: 'shape' }),
    });

    const reranker = createCohereReranker({ apiKey: 'k' });
    await expect(
      reranker.rerank({
        query: 'q',
        documents: [{ id: 'a', content: 'a' }],
        topK: 1,
      })
    ).rejects.toThrow();
  });

  it('no llama fetch si no hay documentos', async () => {
    const reranker = createCohereReranker({ apiKey: 'k' });
    const result = await reranker.rerank({ query: 'q', documents: [], topK: 5 });
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
