"""Runner del harness Python. Espejo de ``evals/runner.ts``.

Corre el MISMO pipeline (embed → match_chunks[_hybrid] → rerank → generación),
calcula las métricas propias (recall/MRR/hit + LLM-as-judge) y, salvo
``--skip-ragas``, las 4 métricas Ragas. Escribe un JSON compatible con
``RunReport`` en ``evals/results/`` para poder compararlo con runs TS
(``npm run eval:compare``).

Uso:
    python -m evals_py.runner [--dataset PATH] [--skip-ragas]
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time

from openai import OpenAI

from . import db, generation, judge, metrics
from .config import AI_CONFIG, DATASET_DEFAULT, RESULTS_DIR, load_env
from .embeddings import embed_query, serialize_embedding
from .models import (
    AggregateGeneration,
    AggregateLatency,
    AggregateMetrics,
    AggregateRetrieval,
    CaseResult,
    EvalCase,
    GenerationMetrics,
    LatencyMetrics,
    RetrievalMetrics,
    RunConfig,
    RunReport,
)
from .rerank import rerank


def load_dataset(path: Path) -> list[EvalCase]:
    if not path.exists():
        raise FileNotFoundError(f"[evals-py/runner] No se encuentra {path}.")

    cases: list[EvalCase] = []
    for i, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("//"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as err:
            raise ValueError(f"[evals-py/runner] línea {i}: JSON inválido ({err}).") from err
        cases.append(EvalCase.model_validate(payload))
    return cases


def _retrieve(supabase, openai_client: OpenAI, user_id: str, case: EvalCase) -> list[db.Chunk]:
    top_k = AI_CONFIG.rag.match_count
    provider = AI_CONFIG.rag.rerank_provider
    fetch_count = (
        top_k * AI_CONFIG.rag.rerank_candidate_pool_multiplier if provider != "none" else top_k
    )

    embedding = embed_query(openai_client, case.question)
    serialized = serialize_embedding(embedding)

    if AI_CONFIG.rag.retrieval_mode == "hybrid":
        chunks = db.match_chunks_hybrid(
            supabase, case.question, serialized, user_id, case.document_ids, fetch_count
        )
    else:
        chunks = db.match_chunks(
            supabase, serialized, user_id, case.document_ids, fetch_count
        )

    return rerank(provider, case.question, chunks, top_k)


def _error_result(case: EvalCase, has_gt: bool, message: str) -> CaseResult:
    return CaseResult(
        case_id=case.id,
        question=case.question,
        has_ground_truth=has_gt,
        retrieval=RetrievalMetrics(
            recall_at_5=0, recall_at_8=0, mrr=0, hit_rate_at_5=0, hit_rate_at_8=0,
            retrieved_chunk_ids=[],
        ),
        generation=GenerationMetrics(faithfulness=0, answer_relevancy=0, answer_text=""),
        latency=LatencyMetrics(retrieval_ms=0, generation_ms=0, judge_ms=0, total_ms=0),
        error=message,
    )


def aggregate(cases: list[CaseResult]) -> AggregateMetrics:
    totals = [c.latency.total_ms for c in cases]
    ok = [c for c in cases if not c.error]
    labeled = [c for c in ok if c.has_ground_truth]

    def _avg_opt(values: list[float | None]) -> float | None:
        present = [v for v in values if v is not None]
        return metrics.average(present) if present else None

    return AggregateMetrics(
        n_cases=len(cases),
        n_with_ground_truth=len(labeled),
        retrieval=AggregateRetrieval(
            avg_recall_at_5=metrics.average([c.retrieval.recall_at_5 for c in labeled]),
            avg_recall_at_8=metrics.average([c.retrieval.recall_at_8 for c in labeled]),
            avg_mrr=metrics.average([c.retrieval.mrr for c in labeled]),
            avg_hit_rate_at_5=metrics.average([c.retrieval.hit_rate_at_5 for c in labeled]),
            avg_hit_rate_at_8=metrics.average([c.retrieval.hit_rate_at_8 for c in labeled]),
        ),
        generation=AggregateGeneration(
            avg_faithfulness=metrics.average([c.generation.faithfulness for c in ok]),
            avg_answer_relevancy=metrics.average([c.generation.answer_relevancy for c in ok]),
            avg_ragas_faithfulness=_avg_opt([c.generation.ragas_faithfulness for c in ok]),
            avg_ragas_answer_relevancy=_avg_opt([c.generation.ragas_answer_relevancy for c in ok]),
            avg_ragas_context_precision=_avg_opt(
                [c.generation.ragas_context_precision for c in ok]
            ),
            avg_ragas_context_recall=_avg_opt([c.generation.ragas_context_recall for c in ok]),
        ),
        latency=AggregateLatency(
            avg_total_ms=metrics.average(totals),
            p95_total_ms=metrics.percentile(totals, 95),
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="StudyAgent RAG evals (Python + Ragas)")
    parser.add_argument("--dataset", type=Path, default=DATASET_DEFAULT)
    parser.add_argument("--skip-ragas", action="store_true")
    args = parser.parse_args()

    env = load_env()
    supabase = db.create_supabase(env)
    openai_client = OpenAI(api_key=env.openai_api_key)

    cases_def = load_dataset(args.dataset)
    if not cases_def:
        print("[evals-py/runner] dataset vacío. Añade casos.")
        return

    print(f"[evals-py/runner] Ejecutando {len(cases_def)} caso(s)...")
    results: list[CaseResult] = []
    ragas_context_by_case: dict[str, list[str]] = {}
    # ground_truth_answer del dataset: es la referencia para Ragas
    # context_precision/recall. NUNCA usar la respuesta generada como referencia
    # (sería circular).
    ground_truth_by_case: dict[str, str] = {c.id: c.ground_truth_answer for c in cases_def}

    for i, case in enumerate(cases_def, start=1):
        print(f"  ({i}/{len(cases_def)}) {case.id} ... ", end="", flush=True)
        try:
            user_id = db.resolve_user_id(supabase, case.document_ids)
            if user_id is None:
                results.append(_error_result(case, len(case.ground_truth_chunk_ids) > 0,
                                             "No se pudo resolver user_id."))
                print("ERROR (user_id)")
                continue
            t_retrieval = time.perf_counter()
            chunks = _retrieve(supabase, openai_client, user_id, case)
            retrieval_ms = (time.perf_counter() - t_retrieval) * 1000
            ragas_context_by_case[case.id] = [c.content for c in chunks]
            result = _finish_case(openai_client, case, chunks, retrieval_ms)
            results.append(result)
            print("ERROR" if result.error else "ok")
        except Exception as err:  # noqa: BLE001
            results.append(_error_result(case, len(case.ground_truth_chunk_ids) > 0, str(err)))
            print(f"THROW ({err})")

    if not args.skip_ragas:
        _attach_ragas_with_contexts(results, ragas_context_by_case, ground_truth_by_case)

    report = RunReport(
        timestamp=datetime.now(timezone.utc).isoformat(),
        config=RunConfig(
            provider=AI_CONFIG.provider,
            chat_model=AI_CONFIG.chat_model,
            embedding_model=AI_CONFIG.embedding_model,
            embedding_dimensions=AI_CONFIG.embedding_dimensions,
            match_count=AI_CONFIG.rag.match_count,
            match_threshold=AI_CONFIG.rag.match_threshold,
            retrieval_mode=AI_CONFIG.rag.retrieval_mode,
            rerank_provider=AI_CONFIG.rag.rerank_provider,
            dataset=str(args.dataset),
        ),
        cases=results,
        aggregate=aggregate(results),
    )

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = report.timestamp.replace(":", "-").replace(".", "-")
    file_name = (
        f"{stamp}_{report.config.retrieval_mode}_{report.config.rerank_provider}"
        f"_{report.config.provider}_py.json"
    )
    out_path = RESULTS_DIR / file_name
    out_path.write_text(report.model_dump_json(indent=2), encoding="utf-8")

    _print_summary(report)
    print(f"[evals-py/runner] Resultado guardado en evals/results/{file_name}")


def _finish_case(
    openai_client: OpenAI, case: EvalCase, chunks: list[db.Chunk], retrieval_ms: float
) -> CaseResult:
    has_gt = len(case.ground_truth_chunk_ids) > 0
    retrieved_ids = [c.id for c in chunks]

    t1 = time.perf_counter()
    answer = generation.generate_answer(openai_client, case.question, chunks)
    generation_ms = (time.perf_counter() - t1) * 1000

    context_text = generation.chunks_to_context(chunks)
    t2 = time.perf_counter()
    faithfulness = judge.judge_faithfulness(openai_client, context_text, answer)
    relevancy = judge.judge_answer_relevancy(openai_client, case.question, answer)
    judge_ms = (time.perf_counter() - t2) * 1000
    # total incluye embedding+retrieval (medido por el llamante), generación y juez.
    total_ms = retrieval_ms + generation_ms + judge_ms

    return CaseResult(
        case_id=case.id,
        question=case.question,
        has_ground_truth=has_gt,
        retrieval=RetrievalMetrics(
            recall_at_5=metrics.recall_at_k(retrieved_ids, case.ground_truth_chunk_ids, 5),
            recall_at_8=metrics.recall_at_k(retrieved_ids, case.ground_truth_chunk_ids, 8),
            mrr=metrics.mean_reciprocal_rank(retrieved_ids, case.ground_truth_chunk_ids),
            hit_rate_at_5=metrics.hit_rate_at_k(retrieved_ids, case.ground_truth_chunk_ids, 5),
            hit_rate_at_8=metrics.hit_rate_at_k(retrieved_ids, case.ground_truth_chunk_ids, 8),
            retrieved_chunk_ids=retrieved_ids,
        ),
        generation=GenerationMetrics(
            faithfulness=faithfulness, answer_relevancy=relevancy, answer_text=answer
        ),
        latency=LatencyMetrics(
            retrieval_ms=retrieval_ms,
            generation_ms=generation_ms,
            judge_ms=judge_ms,
            total_ms=total_ms,
        ),
    )


def _attach_ragas_with_contexts(
    cases: list[CaseResult],
    contexts_by_case: dict[str, list[str]],
    ground_truth_by_case: dict[str, str],
) -> None:
    try:
        from .ragas_eval import RagasSample, evaluate_samples
    except Exception as err:  # noqa: BLE001
        print(f"[evals-py/runner] Ragas no disponible, se omite: {err}")
        return

    ok = [c for c in cases if not c.error and c.generation.answer_text.strip()]
    if not ok:
        return

    samples = [
        RagasSample(
            question=c.question,
            answer=c.generation.answer_text,
            contexts=contexts_by_case.get(c.case_id) or [""],
            # Referencia = respuesta esperada del dataset, no la generada.
            reference=ground_truth_by_case.get(c.case_id, ""),
        )
        for c in ok
    ]
    try:
        scores = evaluate_samples(samples)
    except Exception as err:  # noqa: BLE001
        print(f"[evals-py/runner] Ragas falló, se omite: {err}")
        return

    for case, score in zip(ok, scores):
        case.generation.ragas_faithfulness = score.faithfulness
        case.generation.ragas_answer_relevancy = score.answer_relevancy
        case.generation.ragas_context_precision = score.context_precision
        case.generation.ragas_context_recall = score.context_recall


def _print_summary(report: RunReport) -> None:
    agg = report.aggregate
    print("")
    print("=== StudyAgent Eval Run (Python) ===")
    print(f"Provider:         {report.config.provider}")
    print(f"Chat model:       {report.config.chat_model}")
    print(f"Retrieval mode:   {report.config.retrieval_mode}")
    print(f"Rerank provider:  {report.config.rerank_provider}")
    print(f"Cases:            {agg.n_cases}")
    print("--- Retrieval ---")
    print(f"recall@5:         {agg.retrieval.avg_recall_at_5:.3f}")
    print(f"recall@8:         {agg.retrieval.avg_recall_at_8:.3f}")
    print(f"MRR:              {agg.retrieval.avg_mrr:.3f}")
    print("--- Generation (judge propio) ---")
    print(f"faithfulness:     {agg.generation.avg_faithfulness:.3f}")
    print(f"answer_relevancy: {agg.generation.avg_answer_relevancy:.3f}")
    if agg.generation.avg_ragas_faithfulness is not None:
        print("--- Generation (Ragas) ---")
        print(f"ragas_faithfulness:      {agg.generation.avg_ragas_faithfulness:.3f}")
        if agg.generation.avg_ragas_answer_relevancy is not None:
            print(f"ragas_answer_relevancy:  {agg.generation.avg_ragas_answer_relevancy:.3f}")
        if agg.generation.avg_ragas_context_precision is not None:
            print(f"ragas_context_precision: {agg.generation.avg_ragas_context_precision:.3f}")
        if agg.generation.avg_ragas_context_recall is not None:
            print(f"ragas_context_recall:    {agg.generation.avg_ragas_context_recall:.3f}")
    print("--- Latency ---")
    print(f"avg total:        {agg.latency.avg_total_ms:.0f} ms")
    print(f"p95 total:        {agg.latency.p95_total_ms:.0f} ms")
    print("")


if __name__ == "__main__":
    main()
