import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamText } from 'ai';
import { embedQuery } from '@/lib/ai/embeddings';
import { buildRagPrompt } from '@/lib/ai/prompts';
import { createClient } from '@/lib/supabase/server';
import { POST, __chatTestUtils } from './route';

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn((model: string) => ({ model })),
}));

vi.mock('ai', () => ({
  convertToCoreMessages: vi.fn((messages: unknown) => messages),
  createDataStreamResponse: vi.fn(({ execute }) => {
    const chunks: string[] = [];
    execute({
      write: (value: string) => chunks.push(value),
      writeData: vi.fn(),
      writeMessageAnnotation: vi.fn(),
      writeSource: vi.fn(),
      merge: vi.fn(),
      onError: undefined,
    });
    return new Response(chunks.join(''));
  }),
  formatDataStreamPart: vi.fn((_type: string, value: string) => value),
  streamText: vi.fn(() => ({
    toDataStreamResponse: vi.fn(() => new Response('model-stream')),
  })),
}));

vi.mock('@/lib/ai/embeddings', () => ({
  embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
}));

vi.mock('@/lib/ai/prompts', () => ({
  buildRagPrompt: vi.fn(() => 'rag prompt'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const USER_ID = '22222222-2222-4222-8222-222222222222';

type MockSupabaseOptions = {
  user?: { id: string } | null;
  readyDocuments?: Array<{ id: string }>;
  chunks?: Array<{
    id: string;
    document_id: string;
    content: string;
    chunk_index: number;
    page_number: number | null;
    similarity: number;
  }>;
  readyDocumentsError?: { message: string } | null;
  chunksError?: { message: string } | null;
};

function createThenableQuery<T>(result: T) {
  return {
    in: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
}

function mockSupabase(options: MockSupabaseOptions = {}) {
  const readyDocumentsResult = {
    data: options.readyDocuments ?? [],
    error: options.readyDocumentsError ?? null,
  };

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? { id: USER_ID } : options.user },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => createThenableQuery(readyDocumentsResult)),
      })),
    })),
    rpc: vi.fn(async () => ({
      data: options.chunks ?? [],
      error: options.chunksError ?? null,
    })),
  };

  vi.mocked(createClient).mockResolvedValue(
    supabase as unknown as Awaited<ReturnType<typeof createClient>>
  );

  return supabase;
}

function chatRequest(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rechaza usuarios no autenticados', async () => {
    mockSupabase({ user: null });

    const response = await POST(chatRequest({ messages: [] }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'No autenticado' });
  });

  it('rechaza body invalido', async () => {
    mockSupabase();

    const response = await POST(chatRequest({ messages: [] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Body invalido' });
  });

  it('devuelve mensaje guiado si no hay documentos ready', async () => {
    mockSupabase({ readyDocuments: [] });

    const response = await POST(
      chatRequest({ messages: [{ role: 'user', content: 'Que sabes?' }] })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(__chatTestUtils.NO_READY_DOCUMENTS_MESSAGE);
    expect(embedQuery).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  it('hace RAG y devuelve stream del modelo si hay chunks', async () => {
    const supabase = mockSupabase({
      readyDocuments: [{ id: '33333333-3333-4333-8333-333333333333' }],
      chunks: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          document_id: '33333333-3333-4333-8333-333333333333',
          content: 'Contenido relevante',
          chunk_index: 0,
          page_number: null,
          similarity: 0.8,
        },
      ],
    });

    const response = await POST(
      chatRequest({ messages: [{ role: 'user', content: 'Explica esto' }] })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('model-stream');
    expect(embedQuery).toHaveBeenCalledWith('Explica esto');
    expect(supabase.rpc).toHaveBeenCalledWith('match_chunks', {
      query_embedding: '[0.1,0.2,0.3]',
      match_threshold: 0.5,
      match_count: 8,
      p_user_id: USER_ID,
      p_document_ids: ['33333333-3333-4333-8333-333333333333'],
    });
    expect(buildRagPrompt).toHaveBeenCalledWith('Explica esto', [
      expect.objectContaining({ content: 'Contenido relevante' }),
    ]);
    expect(streamText).toHaveBeenCalled();
  });
});
