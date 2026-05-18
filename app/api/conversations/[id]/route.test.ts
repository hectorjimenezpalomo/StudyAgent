import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

function createSingleQuery<T>(result: QueryResult<T>) {
  return {
    single: vi.fn(async () => result),
  };
}

function createOrderQuery<T>(result: QueryResult<T>) {
  return {
    order: vi.fn(async () => result),
  };
}

function mockSupabase(options: {
  user?: { id: string } | null;
  conversation?: {
    id: string;
    title: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  messages?: Array<{
    id: string;
    conversation_id: string;
    role: string;
    content: unknown;
    tool_calls: unknown | null;
    created_at: string;
  }>;
  conversationError?: { message: string } | null;
  messagesError?: { message: string } | null;
} = {}) {
  const conversationResult = {
    data:
      options.conversation === undefined
        ? {
            id: CONVERSATION_ID,
            title: 'Repaso',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
          }
        : options.conversation,
    error: options.conversationError ?? null,
  };
  const messagesResult = {
    data: options.messages ?? [
      {
        id: '44444444-4444-4444-8444-444444444444',
        conversation_id: CONVERSATION_ID,
        role: 'user',
        content: [{ type: 'text', text: 'Hola' }],
        tool_calls: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    error: options.messagesError ?? null,
  };

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? { id: USER_ID } : options.user },
      }),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() =>
          table === 'conversations'
            ? createSingleQuery(conversationResult)
            : createOrderQuery(messagesResult)
        ),
      })),
    })),
  };

  vi.mocked(createClient).mockResolvedValue(
    supabase as unknown as Awaited<ReturnType<typeof createClient>>
  );

  return supabase;
}

function detailRequest() {
  return new Request(`http://localhost/api/conversations/${CONVERSATION_ID}`);
}

describe('GET /api/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rechaza usuarios no autenticados', async () => {
    mockSupabase({ user: null });

    const response = await GET(detailRequest(), {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'No autenticado' });
  });

  it('valida UUID', async () => {
    mockSupabase();

    const response = await GET(detailRequest(), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'ID invalido' });
  });

  it('devuelve conversacion y mensajes ordenados', async () => {
    mockSupabase();

    const response = await GET(detailRequest(), {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversation: expect.objectContaining({ title: 'Repaso' }),
      messages: [
        expect.objectContaining({
          role: 'user',
          content: 'Hola',
        }),
      ],
    });
  });
});
