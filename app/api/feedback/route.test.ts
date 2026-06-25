import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';

function mockSupabase(options: { user?: { id: string } | null; messageExists?: boolean } = {}) {
  const upsert = vi.fn(async () => ({ error: null }));
  const maybeSingle = vi.fn(async () => ({
    data: options.messageExists === false ? null : { id: MESSAGE_ID },
    error: null,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) =>
    table === 'messages' ? { select } : { upsert }
  );

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? { id: USER_ID } : options.user },
      }),
    },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { upsert, select };
}

function request(body: unknown) {
  return new Request('http://localhost/api/feedback', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rechaza usuarios no autenticados', async () => {
    mockSupabase({ user: null });
    const response = await POST(request({}));
    expect(response.status).toBe(401);
  });

  it('valida el body con zod', async () => {
    mockSupabase();
    const response = await POST(request({ message_id: 'bad', rating: 'great' }));
    expect(response.status).toBe(400);
  });

  it('solo acepta feedback para mensajes visibles por RLS', async () => {
    mockSupabase({ messageExists: false });
    const response = await POST(request({ message_id: MESSAGE_ID, rating: 'helpful' }));
    expect(response.status).toBe(404);
  });

  it('guarda una valoración del usuario autenticado', async () => {
    const { upsert } = mockSupabase();
    const response = await POST(request({ message_id: MESSAGE_ID, rating: 'helpful' }));

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        message_id: MESSAGE_ID,
        rating: 'helpful',
      }),
      { onConflict: 'user_id,message_id' }
    );
  });
});
