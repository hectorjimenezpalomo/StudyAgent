import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ingestDocument } from '../ingest';
import { processNextIngestionJob } from '../ingestion-jobs';
import { createAdminClient } from '@/lib/supabase/admin';

vi.mock('../ingest', () => ({
  ingestDocument: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

const JOB = {
  id: '11111111-1111-4111-8111-111111111111',
  document_id: '22222222-2222-4222-8222-222222222222',
  user_id: '33333333-3333-4333-8333-333333333333',
  attempts: 1,
  max_attempts: 3,
};

function mockAdminClient() {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_ingestion_job') return { data: [JOB], error: null };
    if (name === 'retry_ingestion_job') {
      return { data: [{ retry_scheduled: true, attempts: 1 }], error: null };
    }
    return { data: null, error: null };
  });
  const insert = vi.fn(async () => ({ error: null }));
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    if (table === 'trace_events') return { insert };
    return { update };
  });

  vi.mocked(createAdminClient).mockReturnValue({ rpc, from } as never);
  return { rpc, from, update, eq, insert };
}

describe('processNextIngestionJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reclama y completa una ingesta correcta', async () => {
    const { rpc, insert } = mockAdminClient();
    vi.mocked(ingestDocument).mockResolvedValue({ ok: true });

    await expect(processNextIngestionJob('worker-test')).resolves.toEqual({
      processed: true,
      documentId: JOB.document_id,
      status: 'completed',
    });

    expect(rpc).toHaveBeenCalledWith('claim_ingestion_job', { p_worker_id: 'worker-test' });
    expect(rpc).toHaveBeenCalledWith('complete_ingestion_job', { p_job_id: JOB.id });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'ingestion', status: 'ok', user_id: JOB.user_id })
    );
  });

  it('reintenta una ingesta fallida y devuelve el documento a pending', async () => {
    const { rpc, update } = mockAdminClient();
    vi.mocked(ingestDocument).mockResolvedValue({ ok: false, error: 'Fallo temporal' });

    await expect(processNextIngestionJob('worker-test')).resolves.toEqual({
      processed: true,
      documentId: JOB.document_id,
      status: 'retrying',
    });

    expect(rpc).toHaveBeenCalledWith(
      'retry_ingestion_job',
      expect.objectContaining({ p_job_id: JOB.id, p_error: 'Fallo temporal' })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    );
  });
});
