"""Modelos Pydantic espejo de ``evals/types.ts``.

Cualquier cambio de contrato en el harness TS debe reflejarse aquí para que
``evals/results/*.json`` de ambos harnesses sean intercambiables en
``npm run eval:compare``.

Las métricas Ragas son campos EXTRA (opcionales) dentro de ``GenerationMetrics``
y ``AggregateGeneration``: el harness TS los ignora al leer y ``compare.ts`` solo
lee campos conocidos, así que no rompen la compatibilidad.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class EvalCase(BaseModel):
    id: str
    question: str
    ground_truth_answer: str
    ground_truth_chunk_ids: list[str] = Field(default_factory=list)
    document_ids: list[str]


class RetrievalMetrics(BaseModel):
    recall_at_5: float
    recall_at_8: float
    mrr: float
    hit_rate_at_5: float
    hit_rate_at_8: float
    retrieved_chunk_ids: list[str]


class GenerationMetrics(BaseModel):
    faithfulness: float
    answer_relevancy: float
    answer_text: str
    # Métricas Ragas por caso (extra, opcionales).
    ragas_faithfulness: float | None = None
    ragas_answer_relevancy: float | None = None
    ragas_context_precision: float | None = None
    ragas_context_recall: float | None = None


class LatencyMetrics(BaseModel):
    retrieval_ms: float
    generation_ms: float
    judge_ms: float
    total_ms: float


class CaseResult(BaseModel):
    case_id: str
    question: str
    has_ground_truth: bool
    retrieval: RetrievalMetrics
    generation: GenerationMetrics
    latency: LatencyMetrics
    error: str | None = None


class AggregateRetrieval(BaseModel):
    avg_recall_at_5: float
    avg_recall_at_8: float
    avg_mrr: float
    avg_hit_rate_at_5: float
    avg_hit_rate_at_8: float


class AggregateGeneration(BaseModel):
    avg_faithfulness: float
    avg_answer_relevancy: float
    # Agregados Ragas (extra, opcionales).
    avg_ragas_faithfulness: float | None = None
    avg_ragas_answer_relevancy: float | None = None
    avg_ragas_context_precision: float | None = None
    avg_ragas_context_recall: float | None = None


class AggregateLatency(BaseModel):
    avg_total_ms: float
    p95_total_ms: float


class AggregateMetrics(BaseModel):
    n_cases: int
    n_with_ground_truth: int
    retrieval: AggregateRetrieval
    generation: AggregateGeneration
    latency: AggregateLatency


class RunConfig(BaseModel):
    provider: str
    chat_model: str
    embedding_model: str
    embedding_dimensions: int
    match_count: int
    match_threshold: float
    retrieval_mode: str
    rerank_provider: str
    # Campo extra: ruta del dataset usado (útil con datasets sintéticos).
    dataset: str | None = None
    # Marca de qué harness produjo el run.
    harness: str = "python"


class RunReport(BaseModel):
    timestamp: str
    config: RunConfig
    cases: list[CaseResult]
    aggregate: AggregateMetrics
