import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';

function context(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}

function mockSupabase(options: {
  user: { id: string } | null;
  document?: { status: string; error_message: string | null } | null;
  error?: { message: string } | null;
}) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: options.user },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: options.document ?? null,
            error: options.error ?? null,
          }),
        }),
      }),
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe('GET /api/documents/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rechaza ids invalidos', async () => {
    const response = await GET(new Request('http://localhost'), context('bad-id'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Id de documento invalido' });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('requiere autenticacion', async () => {
    mockSupabase({ user: null });

    const response = await GET(new Request('http://localhost'), context(DOCUMENT_ID));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'No autenticado' });
  });

  it('devuelve el estado del documento', async () => {
    mockSupabase({
      user: { id: 'user-id' },
      document: { status: 'ready', error_message: null },
    });

    const response = await GET(new Request('http://localhost'), context(DOCUMENT_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ready',
      error_message: null,
    });
  });
});
