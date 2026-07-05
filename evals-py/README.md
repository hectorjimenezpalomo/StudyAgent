# evals-py — harness de evals RAG en Python (+ Ragas)

Harness paralelo al de TypeScript (`../evals/`) que corre el **mismo pipeline**
(mismos RPC de Supabase, mismo dataset, mismo formato de salida) y añade métricas
**Ragas**. Es el componente Python del proyecto y la base del agente LangGraph del
Nivel 2. Motivación y decisiones en `../docs/adr/0002-evals-en-python-con-ragas.md`.

## Qué comparte con el harness TS

- Mismo dataset: `../evals/dataset.jsonl` (validado con Pydantic).
- Mismos RPC: `match_chunks` / `match_chunks_hybrid` con los mismos argumentos
  que `../lib/ai/retrieval.ts`.
- Mismos embeddings: OpenAI `text-embedding-3-small` a 1536D (pega sobre el mismo
  índice HNSW).
- Mismo prompt RAG (port literal de `buildRagPrompt`) y mismas métricas de
  retrieval (recall@k, MRR, hit_rate@k).
- Mismo formato de salida: escribe en `../evals/results/<ts>_<mode>_<rerank>_<provider>_py.json`,
  compatible con `RunReport`, así que `npm run eval:compare` compara runs TS vs Py.

## Qué añade

- **4 métricas Ragas** como campos EXTRA (`aggregate.generation.avg_ragas_*` y por
  caso `generation.ragas_*`): `faithfulness`, `answer_relevancy`,
  `context_precision`, `context_recall`. Las dos de contexto miden retrieval por
  LLM sin etiquetar chunks a mano (usan `ground_truth_answer` como referencia).
- **Meta-evaluación "mi judge vs Ragas"**: el harness calcula TANTO el LLM-as-judge
  propio (mismos prompts que `../evals/judge.ts`) como las métricas Ragas sobre las
  mismas respuestas, para contrastar el juez casero con el de referencia.

## Decisiones y límites deliberados

- **Solo OpenAI en la generación (v1)**: el eje de proveedor (OpenAI vs Gemini) se
  compara con el harness TS (`AI_PROVIDER`). Ver ADR 0002.
- **El reranker `llm` NO se porta**: solo `none` y `cohere`. El eje "LLM reranker"
  se cubre con el harness TS.

## Setup

```bash
cd evals-py
uv sync              # crea .venv e instala deps (incluye grupo dev)
uv run pytest        # tests de paridad de métricas (no requieren red)
```

## Uso

Requiere `../.env.local` con `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` y `OPENAI_API_KEY` (se cargan automáticamente).

```bash
uv run python -m evals_py.runner                       # dataset por defecto
uv run python -m evals_py.runner --dataset ../evals/dataset.synthetic.jsonl
uv run python -m evals_py.runner --skip-ragas          # solo métricas propias
```

Los ejes `RAG_RETRIEVAL_MODE` y `RERANK_PROVIDER` se leen del entorno igual que en
el harness TS.

## Nota sobre la API de Ragas

Ragas cambia de API entre minors. `ragas_eval.py` hace imports defensivos y tolera
nombres de métrica alternativos, pero antes de fijar versiones conviene verificar
la API instalada (`evaluate()`, `EvaluationDataset`, `SingleTurnSample`). Si Ragas
no está disponible o falla, el runner continúa sin esas métricas.

## Sesgos del dataset sintético

Ver `../evals/README.md`. El generador (`evals_py/synthesize.py`) produce preguntas
parafraseadas para reducir el solape léxico pregunta↔chunk, pero un dataset
sintético sigue siendo más fácil que preguntas reales de usuario: interpreta los
números absolutos con cautela y fíjate sobre todo en los **deltas** entre
configuraciones.
