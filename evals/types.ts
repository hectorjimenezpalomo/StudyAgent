/**
 * Tipos y schemas zod del harness de evaluación.
 *
 * Mantén `evalCaseSchema` como contrato del dataset: cualquier campo nuevo
 * implica también migrar `evals/dataset.jsonl` y la documentación.
 */

import { z } from 'zod';

export const evalCaseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  ground_truth_answer: z.string().min(1),
  ground_truth_chunk_ids: z.array(z.string().uuid()).default([]),
  document_ids: z.array(z.string().uuid()).min(1),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;

export interface RetrievalMetrics {
  recall_at_5: number;
  recall_at_8: number;
  mrr: number;
  hit_rate_at_5: number;
  hit_rate_at_8: number;
  retrieved_chunk_ids: string[];
}

export interface GenerationMetrics {
  faithfulness: number;
  answer_relevancy: number;
  answer_text: string;
}

export interface LatencyMetrics {
  retrieval_ms: number;
  generation_ms: number;
  judge_ms: number;
  total_ms: number;
}

export interface CaseResult {
  case_id: string;
  question: string;
  retrieval: RetrievalMetrics;
  generation: GenerationMetrics;
  latency: LatencyMetrics;
  error?: string;
}

export interface AggregateMetrics {
  n_cases: number;
  n_with_ground_truth: number;
  retrieval: {
    avg_recall_at_5: number;
    avg_recall_at_8: number;
    avg_mrr: number;
    avg_hit_rate_at_5: number;
    avg_hit_rate_at_8: number;
  };
  generation: {
    avg_faithfulness: number;
    avg_answer_relevancy: number;
  };
  latency: {
    avg_total_ms: number;
    p95_total_ms: number;
  };
}

export interface RunReport {
  timestamp: string;
  config: {
    chat_model: string;
    embedding_model: string;
    embedding_dimensions: number;
    match_count: number;
    match_threshold: number;
  };
  cases: CaseResult[];
  aggregate: AggregateMetrics;
}
