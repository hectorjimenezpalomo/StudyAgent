"""Paridad numérica con ``evals/__tests__/metrics.test.ts``.

Mismos casos que el harness TS: si estos pasan con los mismos valores, las
métricas de retrieval son idénticas entre ambos harnesses.
"""

import math

from evals_py.metrics import (
    average,
    hit_rate_at_k,
    mean_reciprocal_rank,
    percentile,
    recall_at_k,
)


class TestRecallAtK:
    def test_zero_without_ground_truth(self):
        assert recall_at_k(["a", "b"], [], 5) == 0

    def test_one_when_all_relevant_in_top_k(self):
        assert recall_at_k(["a", "b", "c"], ["a", "b"], 5) == 1

    def test_only_considers_first_k(self):
        assert recall_at_k(["x", "y", "a"], ["a"], 2) == 0
        assert recall_at_k(["x", "y", "a"], ["a"], 3) == 1

    def test_fraction_with_several_relevant(self):
        assert math.isclose(recall_at_k(["a", "x", "b", "y"], ["a", "b", "c"], 4), 2 / 3)


class TestMeanReciprocalRank:
    def test_zero_without_ground_truth(self):
        assert mean_reciprocal_rank(["a"], []) == 0

    def test_one_when_first_is_relevant(self):
        assert mean_reciprocal_rank(["a", "b"], ["a"]) == 1

    def test_one_over_n_at_position_n(self):
        assert math.isclose(mean_reciprocal_rank(["x", "y", "a"], ["a"]), 1 / 3)

    def test_zero_when_none_relevant(self):
        assert mean_reciprocal_rank(["x", "y"], ["a"]) == 0


class TestHitRateAtK:
    def test_one_if_any_relevant_in_top_k(self):
        assert hit_rate_at_k(["x", "a", "y"], ["a", "b"], 3) == 1

    def test_zero_if_none_relevant(self):
        assert hit_rate_at_k(["x", "y", "z"], ["a"], 3) == 0

    def test_respects_k_limit(self):
        assert hit_rate_at_k(["x", "y", "a"], ["a"], 2) == 0
        assert hit_rate_at_k(["x", "y", "a"], ["a"], 3) == 1


class TestAverage:
    def test_zero_for_empty(self):
        assert average([]) == 0

    def test_mean(self):
        assert average([1, 2, 3, 4]) == 2.5


class TestPercentile:
    def test_zero_for_empty(self):
        assert percentile([], 95) == 0

    def test_p95_near_max_small_distribution(self):
        values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        assert percentile(values, 95) >= 90

    def test_p50_approximates_median(self):
        assert percentile([1, 2, 3, 4, 5], 50) == 3
