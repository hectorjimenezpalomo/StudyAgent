import { processNextIngestionJob } from '@/lib/ai/ingestion-jobs';
import { z } from 'zod';

export const maxDuration = 60;

const authorizationSchema = z.string().min(1);

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[api/internal/ingest] missing CRON_SECRET');
    return false;
  }

  const authorization = authorizationSchema.safeParse(request.headers.get('authorization'));
  return authorization.success && authorization.data === `Bearer ${secret}`;
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const workerId = `${process.env.VERCEL_REGION ?? 'local'}-${crypto.randomUUID()}`;
    const result = await processNextIngestionJob(workerId);
    return Response.json(result);
  } catch (error) {
    console.error('[api/internal/ingest] run', error);
    return Response.json({ error: 'Error al procesar la cola de ingesta' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
