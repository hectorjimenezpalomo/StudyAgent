# evals/

Harness de evaluación offline del pipeline RAG.

Sin evals, iterar sobre un sistema RAG es a ciegas: cualquier cambio (modelo,
chunk size, threshold, hybrid search, reranking) puede mejorar unos casos y
romper otros. Este harness mide cada cambio contra un dataset etiquetado.

## Qué mide

Por cada caso del dataset, ejecuta el pipeline RAG core
(`embed → match_chunks → generateText`) y reporta:

**Retrieval** (comparando chunks recuperados contra `ground_truth_chunk_ids`):
- `recall@5`, `recall@8`: fracción de chunks relevantes encontrados en el top-k.
- `MRR`: posición inversa del primer chunk relevante. Penaliza tenerlo abajo.
- `hit_rate@5`, `hit_rate@8`: 1 si al menos un relevante aparece en el top-k.

**Generation** (LLM-as-judge con el mismo modelo de chat):
- `faithfulness`: 0-1, cuánto de la respuesta está soportado por el contexto.
- `answer_relevancy`: 0-1, cuánto la respuesta aborda la pregunta.

**Latencia**: media y p95 del tiempo total por caso, desglosado por etapa.

## Cómo correrlo

1. Asegúrate de tener `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` y `OPENAI_API_KEY`.
2. Sube PDFs reales por la app (`/documents`) y espera a que pasen a `ready`.
3. Edita `evals/dataset.jsonl` con casos reales (ver formato más abajo).
4. Ejecuta:

```bash
npm run eval
```

Resultados:
- Tabla resumen en consola.
- JSON detallado en `evals/results/<timestamp>_<mode>.json` (incluye respuestas
  literales y chunks recuperados por caso, útil para hacer post-mortem).

### Comparar configuraciones (retrieval + reranker)

El harness honra dos flags:
- `RAG_RETRIEVAL_MODE` (`vector` | `hybrid`).
- `RERANK_PROVIDER` (`none` | `llm` | `cohere`).

Los results se guardan como `<timestamp>_<mode>_<reranker>.json`, así que
runs con configs distintas conviven sin pisarse.

```bash
# baseline: vector solo, sin reranker
RAG_RETRIEVAL_MODE=vector RERANK_PROVIDER=none npm run eval

# A2: hybrid, sin reranker (requiere migración 004 aplicada)
RAG_RETRIEVAL_MODE=hybrid RERANK_PROVIDER=none npm run eval

# A3: hybrid + reranker LLM
RAG_RETRIEVAL_MODE=hybrid RERANK_PROVIDER=llm npm run eval

# A3 con Cohere (requiere COHERE_API_KEY)
RAG_RETRIEVAL_MODE=hybrid RERANK_PROVIDER=cohere COHERE_API_KEY=... npm run eval

# delta entre los dos últimos runs con configs distintas
npm run eval:compare

# delta entre runs concretos
npm run eval:compare -- evals/results/<baseline>.json evals/results/<candidate>.json
```

`eval:compare` sin argumentos toma los dos runs más recientes que tengan
configs distintas (modo o reranker). Si los últimos N son la misma config,
exige rutas explícitas.

## Formato del dataset

`evals/dataset.jsonl`: un caso por línea, JSON válido. Líneas vacías y las que
empiezan por `//` se ignoran. Schema (zod en `evals/types.ts`):

```jsonc
{
  "id": "string único",
  "question": "pregunta del usuario, en lenguaje natural",
  "ground_truth_answer": "respuesta de referencia (texto libre)",
  "ground_truth_chunk_ids": ["uuid-de-chunk-relevante", "..."],
  "document_ids": ["uuid-de-documento-ingestado", "..."]
}
```

- `document_ids` debe corresponder a documentos ingestados (status `ready`) en
  la Supabase apuntada por `.env.local`. El runner deriva el `user_id` desde
  ellos para satisfacer el filtro de RLS de `match_chunks`.
- `ground_truth_chunk_ids` es opcional. Sin él, las métricas de retrieval
  quedan en 0 pero la evaluación de generación sigue activa.

### Cómo poblar chunk ids relevantes

Tras subir un PDF y verlo en `status=ready`, en Supabase Studio (o psql):

```sql
select id, chunk_index, page_number, left(content, 120) as preview
from chunks
where document_id = '<tu-doc-id>'
order by chunk_index;
```

Lee el `preview`, identifica los chunks que contienen la respuesta a tu
pregunta y copia sus `id` al campo `ground_truth_chunk_ids` del caso.

## Decisiones tomadas

- **Mido el RAG core, no el agente con tool calling.** Las decisiones del
  agente (cuándo llamar `search_documents`, con qué query reformulada) son
  no deterministas y merecen un eval distinto. Aquí me concentro en
  recuperación + generación dado contexto fijo.
- **LLM-as-judge con el mismo modelo de chat**, no con uno superior.
  Pragmático y barato. Asumo varianza inter-run; reportar desviación entre
  runs es trabajo pendiente.
- **Sin librerías externas** (no Ragas, no DeepEval). Implementación mínima
  y auditable: métricas en `metrics.ts` (con tests unitarios), juez en
  `judge.ts`. La regla 4 de `AGENTS.md` ("no añadir dependencias") aplica.

## Trabajo pendiente sobre este harness

- Subset rápido (≤5 casos) para iteración interactiva.
- Workflow semanal en GitHub Actions (Fase D1) que corre el eval y comenta en
  una issue fija con el resumen.
- `eval:compare` que cruza 3 configs a la vez (matriz mode × reranker).
