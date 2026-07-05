# 0002 — Harness de evals paralelo en Python con Ragas

## Contexto

El harness de evals actual (`evals/`) está en TypeScript y funciona. Pero la
oferta pide **Python fuerte** y el ecosistema de evaluación de RAG (Ragas,
deepeval, langsmith) es Python-first. Además el Nivel 2 planea un agente en
LangGraph (Python), que necesitará una base de evaluación en el mismo lenguaje.

## Decisión

- Crear `evals-py/` (proyecto uv, `requires-python >=3.11`) que corre el **mismo
  pipeline**: mismos RPC de Supabase (`match_chunks` / `match_chunks_hybrid`),
  mismo dataset (`evals/dataset.jsonl`), mismo formato de salida
  (`RunReport`-compatible en `evals/results/`) para que `npm run eval:compare`
  funcione contra runs de ambos harnesses.
- Añadir métricas Ragas (`faithfulness`, `answer_relevancy`,
  `context_precision`, `context_recall`) como campos EXTRA dentro de
  `aggregate.generation`, sin romper el contrato con el harness TS. Esto habilita
  una **meta-evaluación**: "mi judge casero vs Ragas" sobre las mismas respuestas.
- El reranker `llm` NO se porta a Python (el eje reranker se cubre con `none` y
  `cohere`); el eje proveedor se cubre con el harness TS. v1 de `evals-py` se
  limita a OpenAI y lo documenta.

## Consecuencias

- El portfolio gana un componente Python real, no un script de juguete.
- Riesgo: Ragas cambia de API entre minors; `ragas_eval.py` debe comprobar la API
  instalada (`evaluate()`, `EvaluationDataset`/`SingleTurnSample`) antes de asumir
  firmas.
- Dos harnesses que hay que mantener en paridad; los tests de métricas
  (`tests/test_metrics.py`) replican los casos de `evals/__tests__/metrics.test.ts`
  para detectar divergencias numéricas.
