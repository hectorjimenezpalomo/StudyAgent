import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const USER_ID = '22222222-2222-4222-8222-222222222222';

function mockSupabase(options: {
  user?: { id: string } | null;
  conversations?: Array<{
    id: string;
    title: string | null;
    created_at: string;
    updated_at: string;
  }>;
  error?: { message: string } | null;
} = {}) {
  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? { id: USER_ID } : options.user },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(async () => ({
          data: options.conversations ?? [],
          error: options.error ?? null,
        })),
      })),
    })),
  };

  vi.mocked(createClient).mockResolvedValue(
    supabase as unknown as Awaited<ReturnType<typeof createClient>>
  );

  return supabase;
}

describe('GET /api/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rechaza usuarios no autenticados', async () => {
    mockSupabase({ user: null });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'No autenticado' });
  });

  it('lista conversaciones del usuario ordenadas por updated_at', async () => {
    const supabase = mockSupabase({
      conversations: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Repaso',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ title: 'Repaso' }),
    ]);
    expect(supabase.from).toHaveBeenCalledWith('conversations');
  });
});
