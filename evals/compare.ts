/**
 * Comparador baseline-vs-candidate.
 *
 * Lee dos `RunReport` (típicamente `vector` vs `hybrid`) y muestra una tabla
 * con el delta en cada métrica agregada y la lista de casos donde una versión
 * mejora o regresa respecto a la otra.
 *
 * Uso:
 *   node --no-warnings=ModuleTypelessPackageJsonWarning evals/compare.ts \
 *     evals/results/<baseline>.json evals/results/<candidate>.json
 *
 * O via npm:
 *   npm run eval:compare -- evals/results/<baseline>.json evals/results/<candidate>.json
 *
 * Sin argumentos, intenta auto-detectar el último `_vector.json` y `_hybrid.json`
 * en `evals/results/`.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaseResult, RunReport } from './types';

const EVALS_DIR = path.resolve(import.meta.dirname);
const RESULTS_DIR = path.join(EVALS_DIR, 'results');

function configKey(report: RunReport): string {
  return `${report.config.retrieval_mode}/${report.config.rerank_provider}`;
}

async function autoDetectReports(): Promise<{ baselinePath: string; candidatePath: string }> {
  let entries: string[];
  try {
    entries = await readdir(RESULTS_DIR);
  } catch {
    throw new Error('[evals/compare] No existe evals/results/. Corre `npm run eval` antes.');
  }

  const sorted = entries
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse();

  if (sorted.length < 2) {
    throw new Error(
      '[evals/compare] Auto-detección necesita al menos 2 runs en evals/results/. Pasa rutas explícitas si no.'
    );
  }

  // Buscamos los dos runs más recientes con configs distintas. Si los dos más
  // recientes tienen la misma config (mismo modo + mismo reranker), no hay
  // comparación útil y pedimos rutas explícitas.
  const [latestPath, ...rest] = sorted.map((name) => path.join(RESULTS_DIR, name));
  const latest = await loadReport(latestPath);
  const latestKey = configKey(latest);

  for (const candidatePath of rest) {
    const candidate = await loadReport(candidatePath);
    if (configKey(candidate) !== latestKey) {
      // Por convención: baseline = el más antiguo (segundo), candidate = el más reciente.
      return { baselinePath: candidatePath, candidatePath: latestPath };
    }
  }

  throw new Error(
    `[evals/compare] Todos los runs encontrados son ${latestKey}. Pasa dos rutas explícitas con configs distintas.`
  );
}

async function loadReport(filePath: string): Promise<RunReport> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as RunReport;
}

function formatDelta(baseline: number, candidate: number): string {
  const delta = candidate - baseline;
  const sign = delta > 0 ? '+' : '';
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '=';
  return `${baseline.toFixed(3)} → ${candidate.toFixed(3)}  (${sign}${delta.toFixed(3)} ${arrow})`;
}

function indexByCaseId(cases: CaseResult[]): Map<string, CaseResult> {
  return new Map(cases.map((c) => [c.case_id, c]));
}

interface CaseDelta {
  case_id: string;
  recall_at_5_delta: number;
  mrr_delta: number;
  faithfulness_delta: number;
}

function computeCaseDeltas(baseline: RunReport, candidate: RunReport): CaseDelta[] {
  const baselineByCase = indexByCaseId(baseline.cases);
  const deltas: CaseDelta[] = [];
  for (const c of candidate.cases) {
    const b = baselineByCase.get(c.case_id);
    if (!b) continue;
    deltas.push({
      case_id: c.case_id,
      recall_at_5_delta: c.retrieval.recall_at_5 - b.retrieval.recall_at_5,
      mrr_delta: c.retrieval.mrr - b.retrieval.mrr,
      faithfulness_delta: c.generation.faithfulness - b.generation.faithfulness,
    });
  }
  return deltas;
}

function printReport(baseline: RunReport, candidate: RunReport): void {
  console.log('');
  console.log('=== StudyAgent Eval Compare ===');
  console.log(`baseline:  ${baseline.config.retrieval_mode} / rerank=${baseline.config.rerank_provider}  @  ${baseline.timestamp}`);
  console.log(`candidate: ${candidate.config.retrieval_mode} / rerank=${candidate.config.rerank_provider}  @  ${candidate.timestamp}`);
  console.log(`cases:     ${baseline.aggregate.n_cases} (baseline) vs ${candidate.aggregate.n_cases} (candidate)`);
  console.log('');

  console.log('--- Retrieval ---');
  console.log(`recall@5:         ${formatDelta(baseline.aggregate.retrieval.avg_recall_at_5, candidate.aggregate.retrieval.avg_recall_at_5)}`);
  console.log(`recall@8:         ${formatDelta(baseline.aggregate.retrieval.avg_recall_at_8, candidate.aggregate.retrieval.avg_recall_at_8)}`);
  console.log(`MRR:              ${formatDelta(baseline.aggregate.retrieval.avg_mrr, candidate.aggregate.retrieval.avg_mrr)}`);
  console.log(`hit_rate@5:       ${formatDelta(baseline.aggregate.retrieval.avg_hit_rate_at_5, candidate.aggregate.retrieval.avg_hit_rate_at_5)}`);
  console.log(`hit_rate@8:       ${formatDelta(baseline.aggregate.retrieval.avg_hit_rate_at_8, candidate.aggregate.retrieval.avg_hit_rate_at_8)}`);
  console.log('');

  console.log('--- Generation ---');
  console.log(`faithfulness:     ${formatDelta(baseline.aggregate.generation.avg_faithfulness, candidate.aggregate.generation.avg_faithfulness)}`);
  console.log(`answer_relevancy: ${formatDelta(baseline.aggregate.generation.avg_answer_relevancy, candidate.aggregate.generation.avg_answer_relevancy)}`);
  console.log('');

  console.log('--- Latency ---');
  console.log(`avg total ms:     ${formatDelta(baseline.aggregate.latency.avg_total_ms, candidate.aggregate.latency.avg_total_ms)}`);
  console.log(`p95 total ms:     ${formatDelta(baseline.aggregate.latency.p95_total_ms, candidate.aggregate.latency.p95_total_ms)}`);
  console.log('');

  const caseDeltas = computeCaseDeltas(baseline, candidate);
  const improved = caseDeltas.filter((d) => d.recall_at_5_delta > 0 || d.mrr_delta > 0);
  const regressed = caseDeltas.filter((d) => d.recall_at_5_delta < 0 || d.mrr_delta < 0);

  console.log(`--- Casos: ${improved.length} mejoran, ${regressed.length} regresan ---`);
  for (const d of regressed) {
    console.log(
      `  [REGRESSION] ${d.case_id}  recall@5 Δ${d.recall_at_5_delta.toFixed(3)}  MRR Δ${d.mrr_delta.toFixed(3)}`
    );
  }
  for (const d of improved.slice(0, 10)) {
    console.log(
      `  [improve]    ${d.case_id}  recall@5 Δ${d.recall_at_5_delta.toFixed(3)}  MRR Δ${d.mrr_delta.toFixed(3)}`
    );
  }
  console.log('');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let baselinePath: string;
  let candidatePath: string;

  if (argv.length === 0) {
    ({ baselinePath, candidatePath } = await autoDetectReports());
    console.log(`[evals/compare] Auto-detectado:`);
    console.log(`  baseline:  ${path.relative(process.cwd(), baselinePath)}`);
    console.log(`  candidate: ${path.relative(process.cwd(), candidatePath)}`);
  } else if (argv.length === 2) {
    baselinePath = path.resolve(argv[0]);
    candidatePath = path.resolve(argv[1]);
  } else {
    throw new Error('[evals/compare] Uso: compare.ts [<baseline.json> <candidate.json>]');
  }

  const [baseline, candidate] = await Promise.all([
    loadReport(baselinePath),
    loadReport(candidatePath),
  ]);

  printReport(baseline, candidate);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
