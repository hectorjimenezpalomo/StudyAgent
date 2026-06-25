import type { AppSupabaseClient } from '@/lib/chat/persistence';
import type { Json } from '@/lib/supabase/types';

export type TraceMetadata = { [key: string]: Json | undefined };

export type UserTraceEvent = {
  requestId: string;
  userId: string;
  conversationId?: string;
  stage: string;
  status: 'ok' | 'error';
  latencyMs: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  metadata?: TraceMetadata;
  errorCode?: string;
};

/** Records metadata only; prompts, responses and PDF text never enter traces. */
export async function recordUserTrace(
  supabase: AppSupabaseClient,
  event: UserTraceEvent
) {
  const { error } = await supabase.from('trace_events').insert({
    request_id: event.requestId,
    user_id: event.userId,
    conversation_id: event.conversationId ?? null,
    stage: event.stage,
    status: event.status,
    latency_ms: event.latencyMs,
    model: event.model ?? null,
    input_tokens: event.inputTokens ?? null,
    output_tokens: event.outputTokens ?? null,
    estimated_cost_usd: event.estimatedCostUsd ?? null,
    metadata: event.metadata ?? {},
    error_code: event.errorCode ?? null,
  });

  if (error) {
    console.error('[observability/traces] insert', error);
  }
}
