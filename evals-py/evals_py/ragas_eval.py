"""Métricas Ragas (opcionales).

Añade 4 métricas al reporte, como campos EXTRA:
- ``faithfulness``        — la respuesta está soportada por el contexto.
- ``answer_relevancy``    — la respuesta aborda la pregunta.
- ``context_precision``   — señal/ruido del contexto recuperado (con referencia).
- ``context_recall``      — cobertura del contexto frente a la respuesta esperada.

``context_precision`` y ``context_recall`` son métricas de RETRIEVAL evaluadas por
LLM: no necesitan que etiquetemos a mano los chunks relevantes; usan la respuesta
esperada (``ground_truth_answer``) como referencia.

⚠️ La API de Ragas cambia entre minors. Este módulo hace imports defensivos y
tolera nombres de métrica alternativos (``ResponseRelevancy`` vs
``AnswerRelevancy``). Si Ragas no está instalado o la carga falla, el runner
continúa sin estas métricas (``--skip-ragas`` o degradación automática). Antes de
fijar versiones, comprueba la API instalada (``evaluate``, ``EvaluationDataset``,
``SingleTurnSample``).
"""

from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass
class RagasSample:
    question: str
    answer: str
    contexts: list[str]
    reference: str


@dataclass
class RagasScores:
    faithfulness: float | None = None
    answer_relevancy: float | None = None
    context_precision: float | None = None
    context_recall: float | None = None


def _build_metrics():
    """Devuelve la lista de métricas Ragas con nombres tolerantes a la versión."""
    from ragas import metrics as m

    faithfulness = m.Faithfulness()
    # answer relevancy cambió de nombre entre versiones.
    relevancy_cls = getattr(m, "ResponseRelevancy", None) or getattr(m, "AnswerRelevancy")
    relevancy = relevancy_cls()
    # context precision con referencia (usa ground_truth_answer).
    precision_cls = getattr(m, "LLMContextPrecisionWithReference", None) or getattr(
        m, "ContextPrecision"
    )
    precision = precision_cls()
    recall_cls = getattr(m, "LLMContextRecall", None) or getattr(m, "ContextRecall")
    recall = recall_cls()
    return faithfulness, relevancy, precision, recall


def evaluate_samples(samples: list[RagasSample]) -> list[RagasScores]:
    """Evalúa cada muestra con Ragas. Lanza si Ragas no está disponible."""
    from ragas import EvaluationDataset, evaluate
    from ragas.dataset_schema import SingleTurnSample
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import LangchainLLMWrapper
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings

    chat_model = os.getenv("OPENAI_CHAT_MODEL") or "gpt-4o-mini"
    embedding_model = os.getenv("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small"
    llm = LangchainLLMWrapper(ChatOpenAI(model=chat_model))
    embeddings = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model=embedding_model))

    faithfulness, relevancy, precision, recall = _build_metrics()

    turn_samples = [
        SingleTurnSample(
            user_input=s.question,
            response=s.answer,
            retrieved_contexts=s.contexts or [""],
            reference=s.reference,
        )
        for s in samples
    ]
    dataset = EvaluationDataset(samples=turn_samples)

    result = evaluate(
        dataset=dataset,
        metrics=[faithfulness, relevancy, precision, recall],
        llm=llm,
        embeddings=embeddings,
    )
    df = result.to_pandas()

    def _col(*names: str):
        for name in names:
            if name in df.columns:
                return df[name]
        return None

    f_col = _col("faithfulness")
    r_col = _col("answer_relevancy", "response_relevancy")
    p_col = _col("llm_context_precision_with_reference", "context_precision")
    rc_col = _col("context_recall", "llm_context_recall")

    scores: list[RagasScores] = []
    for i in range(len(samples)):
        scores.append(
            RagasScores(
                faithfulness=_safe(f_col, i),
                answer_relevancy=_safe(r_col, i),
                context_precision=_safe(p_col, i),
                context_recall=_safe(rc_col, i),
            )
        )
    return scores


def _safe(col, i: int) -> float | None:
    if col is None:
        return None
    try:
        value = float(col.iloc[i])
    except (TypeError, ValueError):
        return None
    return None if value != value else value  # descarta NaN
