"""Métricas de retrieval puras, sin side effects.

Port EXACTO de ``evals/metrics.ts``. Los tests de ``tests/test_metrics.py``
replican los casos de ``evals/__tests__/metrics.test.ts`` para garantizar paridad
numérica entre los dos harnesses.
"""

from __future__ import annotations

from collections.abc import Sequence
import math


def recall_at_k(
    retrieved_ids: Sequence[str], ground_truth_ids: Sequence[str], k: int
) -> float:
    """recall@k: fracción de chunks relevantes presentes en el top-k."""
    if len(ground_truth_ids) == 0:
        return 0.0

    top_k = set(retrieved_ids[:k])
    hits = sum(1 for gid in ground_truth_ids if gid in top_k)
    return hits / len(ground_truth_ids)


def mean_reciprocal_rank(
    retrieved_ids: Sequence[str], ground_truth_ids: Sequence[str]
) -> float:
    """MRR: inverso de la posición (1-indexed) del primer relevante."""
    if len(ground_truth_ids) == 0:
        return 0.0

    ground_truth = set(ground_truth_ids)
    for i, rid in enumerate(retrieved_ids):
        if rid in ground_truth:
            return 1.0 / (i + 1)
    return 0.0


def hit_rate_at_k(
    retrieved_ids: Sequence[str], ground_truth_ids: Sequence[str], k: int
) -> float:
    """hit@k: 1 si hay al menos un relevante en el top-k, 0 si no."""
    if len(ground_truth_ids) == 0:
        return 0.0

    ground_truth = set(ground_truth_ids)
    for i in range(min(k, len(retrieved_ids))):
        if retrieved_ids[i] in ground_truth:
            return 1.0
    return 0.0


def average(values: Sequence[float]) -> float:
    if len(values) == 0:
        return 0.0
    return sum(values) / len(values)


def percentile(values: Sequence[float], p: float) -> float:
    """Mismo cálculo que ``evals/metrics.ts`` (índice truncado, no interpolado)."""
    if len(values) == 0:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, math.floor((p / 100) * len(ordered)))
    return ordered[index]
