// Lee el run más reciente de evals/results/ y emite una tabla markdown por stdout
// (el workflow la redirige a $GITHUB_STEP_SUMMARY). Sin dependencias externas.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const RESULTS_DIR = path.resolve('evals/results');

function fmt(value, digits = 3) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

async function main() {
  let files;
  try {
    files = (await readdir(RESULTS_DIR)).filter((name) => name.endsWith('.json'));
  } catch {
    console.log('## RAG eval\n\nNo se generó ningún resultado (¿faltan secrets o datos?).');
    return;
  }
  if (files.length === 0) {
    console.log('## RAG eval\n\nNo se generó ningún resultado.');
    return;
  }

  const latest = files.sort().reverse()[0];
  const report = JSON.parse(await readFile(path.join(RESULTS_DIR, latest), 'utf8'));
  const c = report.config;
  const a = report.aggregate;

  const lines = [
    '## RAG eval',
    '',
    `**Run:** \`${latest}\`  ·  provider=\`${c.provider ?? 'openai'}\`  ·  mode=\`${c.retrieval_mode}\`  ·  rerank=\`${c.rerank_provider}\``,
    `**Dataset:** \`${c.dataset ?? 'evals/dataset.jsonl'}\`  ·  casos: ${a.n_cases} (${a.n_with_ground_truth} con ground truth)`,
    '',
    '| métrica | valor |',
    '|---|---|',
    `| recall@8 | ${fmt(a.retrieval.avg_recall_at_8)} |`,
    `| recall@5 | ${fmt(a.retrieval.avg_recall_at_5)} |`,
    `| MRR | ${fmt(a.retrieval.avg_mrr)} |`,
    `| hit_rate@8 | ${fmt(a.retrieval.avg_hit_rate_at_8)} |`,
    `| faithfulness | ${fmt(a.generation.avg_faithfulness)} |`,
    `| answer_relevancy | ${fmt(a.generation.avg_answer_relevancy)} |`,
    `| p95 total ms | ${fmt(a.latency.p95_total_ms, 0)} |`,
    `| avg total ms | ${fmt(a.latency.avg_total_ms, 0)} |`,
  ];
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.log(`## RAG eval\n\nError al construir el resumen: ${err.message}`);
});
