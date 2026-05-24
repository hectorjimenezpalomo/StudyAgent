/**
 * Runner del harness de evaluación.
 *
 * Lee `evals/dataset.jsonl`, ejecuta el pipeline RAG + LLM-as-judge sobre
 * cada caso, agrega métricas y escribe el resultado en
 * `evals/results/<timestamp>.json`. También imprime una tabla resumen.
 *
 * Ejecución: `npm run eval`.
 *
 * Requiere `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE_KEY` y `OPENAI_API_KEY`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AI_CONFIG } from '../lib/ai/config';
import { judgeAnswerRelevancy, judgeFaithfulness } from './judge';
import { average, hitRateAtK, meanReciprocalRank, percentile, recallAtK } from './metrics';
import { runPipeline } from './pipeline';
import { evalCaseSchema, type AggregateMetrics, type CaseResult, type EvalCase, type RunReport } from './types';

const EVALS_DIR = path.resolve(import.meta.dirname);
const DATASET_PATH = path.join(EVALS_DIR, 'dataset.jsonl');
const RESULTS_DIR = path.join(EVALS_DIR, 'results');

interface RequiredEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
}

function loadEnv(): RequiredEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const missing: string[] = [];
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!openaiApiKey) missing.push('OPENAI_API_KEY');

  if (missing.length > 0) {
    throw new Error(
      `[evals/runner] Faltan variables de entorno: ${missing.join(', ')}. Asegúrate de pasar --env-file=.env.local.`
    );
  }

  return {
    supabaseUrl: supabaseUrl!,
    supabaseServiceRoleKey: supabaseServiceRoleKey!,
    openaiApiKey: openaiApiKey!,
  };
}

async function loadDataset(): Promise<EvalCase[]> {
  let raw: string;
  try {
    raw = await readFile(DATASET_PATH, 'utf8');
  } catch {
    throw new Error(`[evals/runner] No se encuentra ${DATASET_PATH}.`);
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));

  const cases: EvalCase[] = [];
  for (const [i, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`[evals/runner] dataset.jsonl línea ${i + 1}: JSON inválido (${(err as Error).message}).`);
    }
    const result = evalCaseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `[evals/runner] dataset.jsonl línea ${i + 1}: ${result.error.issues
          .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
          .join('; ')}`
      );
    }
    cases.push(result.data);
  }

  return cases;
}

function resolveUserIdFromDocs(supabase: SupabaseClient, documentIds: string[]) {
  return supabase
    .from('documents')
    .select('user_id')
    .in('id', documentIds)
    .limit(1)
    .maybeSingle();
}

async function runCase(supabase: SupabaseClient, caseDef: EvalCase): Promise<CaseResult> {
  const totalStart = Date.now();

  const { data: doc, error: docError } = await resolveUserIdFromDocs(supabase, caseDef.document_ids);
  if (docError || !doc) {
    return {
      case_id: caseDef.id,
      question: caseDef.question,
      retrieval: {
        recall_at_5: 0,
        recall_at_8: 0,
        mrr: 0,
        hit_rate_at_5: 0,
        hit_rate_at_8: 0,
        retrieved_chunk_ids: [],
      },
      generation: { faithfulness: 0, answer_relevancy: 0, answer_text: '' },
      latency: { retrieval_ms: 0, generation_ms: 0, judge_ms: 0, total_ms: Date.now() - totalStart },
      error: `No se pudo resolver user_id para los document_ids del caso (${docError?.message ?? 'no rows'}).`,
    };
  }

  const userId = doc.user_id as string;

  const pipeline = await runPipeline(supabase, userId, caseDef.question, caseDef.document_ids);
  const retrievedIds = pipeline.retrieved.map((c) => c.id);

  const tJudgeStart = Date.now();
  const [faithfulness, relevancy] = await Promise.all([
    judgeFaithfulness(pipeline.contextText, pipeline.answer),
    judgeAnswerRelevancy(caseDef.question, pipeline.answer),
  ]);
  const judge_ms = Date.now() - tJudgeStart;

  const total_ms = Date.now() - totalStart;

  return {
    case_id: caseDef.id,
    question: caseDef.question,
    retrieval: {
      recall_at_5: recallAtK(retrievedIds, caseDef.ground_truth_chunk_ids, 5),
      recall_at_8: recallAtK(retrievedIds, caseDef.ground_truth_chunk_ids, 8),
      mrr: meanReciprocalRank(retrievedIds, caseDef.ground_truth_chunk_ids),
      hit_rate_at_5: hitRateAtK(retrievedIds, caseDef.ground_truth_chunk_ids, 5),
      hit_rate_at_8: hitRateAtK(retrievedIds, caseDef.ground_truth_chunk_ids, 8),
      retrieved_chunk_ids: retrievedIds,
    },
    generation: {
      faithfulness: faithfulness.score,
      answer_relevancy: relevancy.score,
      answer_text: pipeline.answer,
    },
    latency: {
      retrieval_ms: pipeline.retrieval_ms,
      generation_ms: pipeline.generation_ms,
      judge_ms,
      total_ms,
    },
  };
}

function aggregate(cases: CaseResult[]): AggregateMetrics {
  const totals = cases.map((c) => c.latency.total_ms);
  const withGroundTruth = cases.filter((c) => c.retrieval.retrieved_chunk_ids.length > 0);

  return {
    n_cases: cases.length,
    n_with_ground_truth: cases.filter((c) => c.retrieval.recall_at_8 > 0 || c.retrieval.hit_rate_at_8 > 0)
      .length,
    retrieval: {
      avg_recall_at_5: average(cases.map((c) => c.retrieval.recall_at_5)),
      avg_recall_at_8: average(cases.map((c) => c.retrieval.recall_at_8)),
      avg_mrr: average(cases.map((c) => c.retrieval.mrr)),
      avg_hit_rate_at_5: average(cases.map((c) => c.retrieval.hit_rate_at_5)),
      avg_hit_rate_at_8: average(cases.map((c) => c.retrieval.hit_rate_at_8)),
    },
    generation: {
      avg_faithfulness: average(withGroundTruth.map((c) => c.generation.faithfulness)),
      avg_answer_relevancy: average(withGroundTruth.map((c) => c.generation.answer_relevancy)),
    },
    latency: {
      avg_total_ms: average(totals),
      p95_total_ms: percentile(totals, 95),
    },
  };
}

function printSummary(report: RunReport): void {
  console.log('');
  console.log('=== StudyAgent Eval Run ===');
  console.log(`Timestamp:        ${report.timestamp}`);
  console.log(`Chat model:       ${report.config.chat_model}`);
  console.log(`Embedding model:  ${report.config.embedding_model} (${report.config.embedding_dimensions}d)`);
  console.log(`Retrieval mode:   ${report.config.retrieval_mode}`);
  console.log(`Rerank provider:  ${report.config.rerank_provider}`);
  console.log(`Cases:            ${report.aggregate.n_cases}`);
  console.log('');
  console.log('--- Retrieval ---');
  console.log(`recall@5:         ${report.aggregate.retrieval.avg_recall_at_5.toFixed(3)}`);
  console.log(`recall@8:         ${report.aggregate.retrieval.avg_recall_at_8.toFixed(3)}`);
  console.log(`MRR:              ${report.aggregate.retrieval.avg_mrr.toFixed(3)}`);
  console.log(`hit_rate@5:       ${report.aggregate.retrieval.avg_hit_rate_at_5.toFixed(3)}`);
  console.log(`hit_rate@8:       ${report.aggregate.retrieval.avg_hit_rate_at_8.toFixed(3)}`);
  console.log('');
  console.log('--- Generation (LLM-as-judge) ---');
  console.log(`faithfulness:     ${report.aggregate.generation.avg_faithfulness.toFixed(3)}`);
  console.log(`answer_relevancy: ${report.aggregate.generation.avg_answer_relevancy.toFixed(3)}`);
  console.log('');
  console.log('--- Latency ---');
  console.log(`avg total:        ${report.aggregate.latency.avg_total_ms.toFixed(0)} ms`);
  console.log(`p95 total:        ${report.aggregate.latency.p95_total_ms.toFixed(0)} ms`);
  console.log('');

  const errored = report.cases.filter((c) => c.error);
  if (errored.length > 0) {
    console.log(`--- Errores (${errored.length}) ---`);
    for (const c of errored) {
      console.log(`  [${c.case_id}] ${c.error}`);
    }
    console.log('');
  }
}

async function main(): Promise<void> {
  const env = loadEnv();

  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cases = await loadDataset();
  if (cases.length === 0) {
    console.log('[evals/runner] dataset.jsonl está vacío. Añade casos para correr el eval.');
    return;
  }

  console.log(`[evals/runner] Ejecutando ${cases.length} caso(s)...`);
  const results: CaseResult[] = [];
  for (const [i, caseDef] of cases.entries()) {
    process.stdout.write(`  (${i + 1}/${cases.length}) ${caseDef.id} ... `);
    try {
      const result = await runCase(supabase, caseDef);
      results.push(result);
      console.log(result.error ? `ERROR (${result.error})` : 'ok');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`THROW (${message})`);
      results.push({
        case_id: caseDef.id,
        question: caseDef.question,
        retrieval: {
          recall_at_5: 0,
          recall_at_8: 0,
          mrr: 0,
          hit_rate_at_5: 0,
          hit_rate_at_8: 0,
          retrieved_chunk_ids: [],
        },
        generation: { faithfulness: 0, answer_relevancy: 0, answer_text: '' },
        latency: { retrieval_ms: 0, generation_ms: 0, judge_ms: 0, total_ms: 0 },
        error: message,
      });
    }
  }

  const report: RunReport = {
    timestamp: new Date().toISOString(),
    config: {
      chat_model: AI_CONFIG.chatModel,
      embedding_model: AI_CONFIG.embeddingModel,
      embedding_dimensions: AI_CONFIG.embeddingDimensions,
      match_count: AI_CONFIG.rag.matchCount,
      match_threshold: AI_CONFIG.rag.matchThreshold,
      retrieval_mode: AI_CONFIG.rag.retrievalMode,
      rerank_provider: AI_CONFIG.rag.rerankProvider,
    },
    cases: results,
    aggregate: aggregate(results),
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const fileName = `${report.timestamp.replace(/[:.]/g, '-')}_${report.config.retrieval_mode}_${report.config.rerank_provider}.json`;
  const outputPath = path.join(RESULTS_DIR, fileName);
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  printSummary(report);
  console.log(`[evals/runner] Resultado guardado en evals/results/${fileName}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[evals/runner] ${message}`);
  process.exit(1);
});
