import { z } from 'zod';
import { ingestDocument } from './ingest';
import { createAdminClient } from '@/lib/supabase/admin';

const claimedJobSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  user_id: z.string().uuid(),
  attempts: z.number().int().positive(),
  max_attempts: z.number().int().positive(),
});

const retryResultSchema = z.object({
  retry_scheduled: z.boolean(),
  attempts: z.number().int().positive(),
});

export type IngestionJobRun =
  | { processed: false }
  | {
      processed: true;
      documentId: string;
      status: 'completed' | 'retrying' | 'failed';
    };

function retryDelaySeconds(attempts: number) {
  return Math.min(15 * 60, 60 * 2 ** Math.max(0, attempts - 1));
}

async function recordIngestionTrace(
  userId: string,
  status: 'ok' | 'error',
  latencyMs: number,
  metadata: Record<string, string | number | boolean>,
  errorCode?: string
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from('trace_events').insert({
    request_id: crypto.randomUUID(),
    user_id: userId,
    stage: 'ingestion',
    status,
    latency_ms: latencyMs,
    metadata,
    error_code: errorCode ?? null,
  });

  if (error) {
    console.error('[ai/ingestion-jobs] trace', error);
  }
}

/**
 * Claims at most one job atomically. This function is intended for the
 * authenticated cron endpoint and can be safely invoked concurrently.
 */
export async function processNextIngestionJob(
  workerId: string
): Promise<IngestionJobRun> {
  const supabase = createAdminClient();
  const { data, error: claimError } = await supabase.rpc('claim_ingestion_job', {
    p_worker_id: workerId,
  });

  if (claimError) {
    console.error('[ai/ingestion-jobs] claim', claimError);
    throw new Error('No se pudo reclamar una ingesta');
  }

  const parsedJobs = z.array(claimedJobSchema).safeParse(data ?? []);
  if (!parsedJobs.success) {
    console.error('[ai/ingestion-jobs] invalid claimed job', parsedJobs.error);
    throw new Error('La cola de ingesta devolvio una respuesta invalida');
  }

  const job = parsedJobs.data[0];
  if (!job) {
    return { processed: false };
  }

  const startedAt = Date.now();
  const result = await ingestDocument(job.document_id);
  const latencyMs = Date.now() - startedAt;

  if (result.ok) {
    const { error: completeError } = await supabase.rpc('complete_ingestion_job', {
      p_job_id: job.id,
    });
    if (completeError) {
      console.error('[ai/ingestion-jobs] complete', completeError);
      throw new Error('No se pudo completar la ingesta');
    }

    await recordIngestionTrace(job.user_id, 'ok', latencyMs, {
      job_id: job.id,
      document_id: job.document_id,
      attempt: job.attempts,
    });
    return { processed: true, documentId: job.document_id, status: 'completed' };
  }

  const { data: retryData, error: retryError } = await supabase.rpc('retry_ingestion_job', {
    p_job_id: job.id,
    p_error: result.error,
    p_retry_delay_seconds: retryDelaySeconds(job.attempts),
  });

  if (retryError) {
    console.error('[ai/ingestion-jobs] retry', retryError);
    throw new Error('No se pudo reprogramar la ingesta');
  }

  const parsedRetry = z.array(retryResultSchema).safeParse(retryData ?? []);
  if (!parsedRetry.success || !parsedRetry.data[0]) {
    console.error('[ai/ingestion-jobs] invalid retry response', parsedRetry.error);
    throw new Error('La cola de ingesta devolvio una respuesta invalida');
  }

  const retry = parsedRetry.data[0];
  const status = retry.retry_scheduled ? 'retrying' : 'failed';
  const documentError = retry.retry_scheduled
    ? 'La ingesta falló temporalmente y se reintentará automáticamente.'
    : result.error;

  const { error: documentErrorUpdate } = await supabase
    .from('documents')
    .update({
      status: retry.retry_scheduled ? 'pending' : 'error',
      error_message: documentError,
    })
    .eq('id', job.document_id);
  if (documentErrorUpdate) {
    console.error('[ai/ingestion-jobs] document status', documentErrorUpdate);
  }

  await recordIngestionTrace(
    job.user_id,
    'error',
    latencyMs,
    {
      job_id: job.id,
      document_id: job.document_id,
      attempt: retry.attempts,
      retry_scheduled: retry.retry_scheduled,
    },
    'ingestion_failed'
  );

  return { processed: true, documentId: job.document_id, status };
}
