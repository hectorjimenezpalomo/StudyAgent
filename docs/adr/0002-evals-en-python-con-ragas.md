# 0002 — Parallel Python evaluation harness with Ragas

## Context

The TypeScript harness in `evals/` works, while much of the RAG evaluation ecosystem—including Ragas, DeepEval, and LangSmith—is Python-first. A future LangGraph agent would also benefit from evaluation infrastructure in the same language.

## Decision

- Create `evals-py/` as a uv project requiring Python 3.11+. It runs the same Supabase RPCs, dataset, and output format as the TypeScript harness so `npm run eval:compare` can compare both.
- Add Ragas `faithfulness`, `answer_relevancy`, `context_precision`, and `context_recall` as extra generation fields without breaking the TypeScript report contract. This permits comparing the local judge and Ragas on identical answers.
- Do not port the `llm` reranker to Python. Python covers `none` and `cohere`; TypeScript covers provider comparisons. Python v1 uses OpenAI only.

## Consequences

- Ragas APIs can change between minor releases, so `ragas_eval.py` defensively checks installed APIs.
- Both harnesses must remain numerically aligned. Python metric tests mirror the TypeScript cases to detect divergence.

