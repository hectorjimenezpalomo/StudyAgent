# ROADMAP.md

## Estado actual

Fases 1-5 completas. Auth, upload, ingesta con embeddings, chat con RAG, agente con tool calling, persistencia de conversaciones, tests unitarios y e2e, despliegue.

Siguiente bloque de trabajo: convertir el proyecto en un caso de estudio de **AI applied engineering** con evaluación, observabilidad, recuperación avanzada y CI.

## Fase A — RAG avanzado y evaluación

Objetivo: pasar de "RAG básico que funciona" a "RAG medible e iterable".

### A1. Harness de evaluación (`evals/`)
- Dataset etiquetado en `evals/dataset.jsonl`: 30-40 pares `{question, ground_truth_answer, ground_truth_chunk_ids, document_ids}`.
- Runner (`evals/runner.ts`) que ejecuta el pipeline real (`search_documents` + generación) sobre cada caso.
- Métricas de retrieval: `recall@k`, `MRR`, `hit_rate`.
- Métricas de generación: `faithfulness` y `answer_relevancy` con LLM-as-judge (`generateObject` sobre `gpt-4o-mini`).
- Output JSON en `evals/results/<timestamp>.json` + tabla en consola.
- Script `npm run eval`.

### A2. Hybrid search (vector + BM25)
- Migración nueva con índice GIN sobre `tsvector` derivado de `chunks.content`.
- RPC `match_chunks_hybrid` que combina pgvector + `ts_rank_cd` con Reciprocal Rank Fusion.
- Tool `search_documents` con flag `mode: 'vector' | 'hybrid'`.
- Validar contra A1 y publicar delta de `recall@5` en el README.

### A3. Reranking con cross-encoder
- Etapa intermedia retrieve(top-20) → rerank → top-5.
- Detrás de feature flag para correr A/B contra evals.
- Decisión de proveedor pendiente (Cohere Rerank vs HF Inference vs modelo local). Requiere PR de propuesta antes de añadir dependencia.

### A4. Query rewriting / HyDE
- Reescritura de la query con LLM mini o generación de un "documento hipotético" para embebedar.
- Mejora retrieval en queries cortas o ambiguas.
- Validar contra A1.

## Fase B — Observabilidad y producción

### B1. Tracing end-to-end
- Tabla `traces` (`request_id`, `stage`, `latency_ms`, `tokens_in`, `tokens_out`, `cost_usd`, `model`, `user_id`).
- Wrappers sobre `embedText`, `generateText`, `generateObject`, RPCs.
- Panel en `/admin`: p50/p95 por etapa, coste $/día, top usuarios por coste.

### B2. Cache semántica de respuestas
- Tabla `query_cache` con embedding de la query y respuesta cacheada (TTL).
- Hit si similitud > 0.95 sobre el mismo `document_ids`.
- Métrica de hit rate expuesta en `/admin`.

### B3. Rate limiting y defensa frente a prompt injection
- Rate limit por usuario sobre `/api/chat` (token bucket en Postgres).
- Heurística anti-injection sobre el contenido de chunks antes de inyectarlo en el prompt (PDFs hostiles).

## Fase C — UX que solo se construye si entiendes RAG

### C1. Citas con número de página y resaltado
- Cada respuesta del chat lista citas `[doc, p.N]` clicables.
- Visor PDF embebido que abre la página y resalta el chunk recuperado.

### C2. Streaming visible del tool calling
- Estado del agente expuesto en UI: `thinking…` → `searching…` → `found N chunks` → `writing answer`.

### C3. Multi-modal (vision)
- Subida de imágenes (capturas de pizarra). Procesado con visión (`gpt-4o`) y normalizado como documento ingerible.

## Fase D — Higiene de proyecto activo

### D1. CI
- `.github/workflows/ci.yml`: `typecheck`, `test`, `build` en cada PR a `main`.
- Workflow opcional semanal con `npm run eval` que comenta resultados en una issue fija.

### D2. CHANGELOG.md
- Mantenido a mano con cada feature mergeada.

### D3. README enriquecido
- GIF/imagen del flujo principal, badge de CI, diagrama de arquitectura (Mermaid).

### D4. ROADMAP → issues
- Cada item de Fase A-C convertido en issue de GitHub con acceptance criteria y label `phase:A` / `phase:B` / `phase:C`.

## Trabajo futuro sin priorizar

- Export real a Anki (`.apkg`) para flashcards generadas.
- Resumen jerárquico para documentos largos (la tool actual carga el documento entero, falla en PDFs grandes).
- Compartir documentos entre usuarios con permisos explícitos.
- Métricas de coste por usuario expuestas en `/admin` (cubierto parcialmente por B1).

## Cómo añadir una feature

1. Acceptance criteria concretos en un issue antes de codear.
2. Si toca BBDD: migración nueva + `npm run db:types`.
3. Si toca tools del agente: entry nueva en `ARCHITECTURE.md`, schema zod en `lib/ai/tools.ts`.
4. Tests en `lib/ai/__tests__` o `app/api/.../*.test.ts`.
5. Si toca el pipeline de RAG: correr `npm run eval` antes y después, anotar delta en el PR.
6. Verificación local: `npm run typecheck && npm run test && npm run build`.
