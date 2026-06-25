import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { POST, __uploadTestUtils } from './route';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const USER_ID = '22222222-2222-4222-8222-222222222222';

function mockSupabase(options: {
  user?: { id: string } | null;
  insertError?: { message: string } | null;
  uploadError?: { message: string } | null;
} = {}) {
  const insert = vi.fn(async () => ({ error: options.insertError ?? null }));
  const upload = vi.fn(async () => ({ error: options.uploadError ?? null }));
  const deleteMock = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }));

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? { id: USER_ID } : options.user },
      }),
    },
    from: vi.fn(() => ({
      insert,
      delete: deleteMock,
    })),
    storage: {
      from: vi.fn(() => ({
        upload,
      })),
    },
  };

  vi.mocked(createClient).mockResolvedValue(
    supabase as unknown as Awaited<ReturnType<typeof createClient>>
  );

  return { supabase, insert, upload };
}

function uploadRequest(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    body: formData,
  });
}

function pdfFile(content = '%PDF-1.4\nPDF content') {
  return new File([content], 'demo.pdf', { type: 'application/pdf' });
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detecta firma PDF real', async () => {
    await expect(__uploadTestUtils.hasPdfSignature(pdfFile())).resolves.toBe(true);
    await expect(
      __uploadTestUtils.hasPdfSignature(
        new File(['not a pdf'], 'fake.pdf', { type: 'application/pdf' })
      )
    ).resolves.toBe(false);
  });

  it('rechaza PDF con mime correcto pero firma invalida', async () => {
    mockSupabase();

    const response = await POST(
      uploadRequest(new File(['not a pdf'], 'fake.pdf', { type: 'application/pdf' }))
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Solo se aceptan PDFs validos' });
  });

  it('acepta PDF con firma valida y encola una ingesta durable', async () => {
    const { insert, upload } = mockSupabase();

    const response = await POST(uploadRequest(pdfFile()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ document_id: expect.any(String) });
    expect(insert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user_id: USER_ID,
        title: 'demo.pdf',
        status: 'pending',
      })
    );
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${USER_ID}/.+\\.pdf$`)),
      expect.any(File),
      expect.objectContaining({ contentType: 'application/pdf' })
    );
    expect(insert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        user_id: USER_ID,
        document_id: expect.any(String),
      })
    );
  });
});
