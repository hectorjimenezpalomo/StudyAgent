# ROADMAP.md

## Estado actual

Fases 1-5 completas. Auth, upload, ingesta con embeddings, chat con RAG, agente con tool calling, persistencia de conversaciones, tests unitarios y e2e, despliegue.

Siguiente bloque de trabajo: convertir el proyecto en un caso de estudio de **AI applied engineering** con evaluación reproducible y mejoras avanzadas de recuperación.

El trabajo restante se organiza en tres niveles por ratio señal/esfuerzo para la candidatura a Intern AI Engineer (workflows agénticos + RAG, Python, best practices de test/deploy/monitoring de apps GenAI; nice-to-have: Vertex/Gemini, MCP, LangChain/LangGraph/ADK). Las decisiones de arquitectura relevantes están en `docs/adr/`.

---

## Nivel 1 — Candidatura (en curso)

Las 5 mejoras de máximo ratio señal/esfuerzo. Detalle histórico de las capas RAG en "Fase A" más abajo.

1. **Proveedor de chat conmutable OpenAI ↔ Gemini** (`AI_PROVIDER=openai|google`). Gemini vía Google AI Studio (`@ai-sdk/google`, sin cuenta GCP). Factoría `lib/ai/provider.ts` que aísla la futura migración a Vertex. Permite publicar una matriz `provider × retrieval × reranker` con el harness existente. Ver `docs/adr/0001-proveedor-chat-multiproveedor.md`.
2. **Servidor MCP** sobre las 5 tools del agente (stdio, consumible desde Claude Desktop/Cursor). Ver `docs/adr/0003-servidor-mcp.md`.
3. **Harness de evals v2 en Python con Ragas** (`evals-py/`): mismo pipeline, mismo dataset, mismo formato de salida, más métricas Ragas. Base del Nivel 2. Ver `docs/adr/0002-evals-en-python-con-ragas.md`.
4. **Generador de dataset sintético** (`evals-py/evals_py/synthesize.py`): de ~10 casos manuales a 100+ generados por LLM, con el chunk origen como ground truth.
5. **CI ampliada + eval de regresión + README como landing** del portfolio.

## Nivel 2 — Aprendizaje profundo (pendiente)

- **(a) Agente comparativo en LangGraph (Python) + FastAPI en Cloud Run + Vertex AI**, evaluado con el harness Python: "mismo RAG, dos runtimes, misma métrica". Apéndice comparando conceptos con **ADK** (Agent Development Kit).
- **(b) Observabilidad estándar**: `experimental_telemetry` del AI SDK → OpenTelemetry → Langfuse, manteniendo `trace_events` como contraste. **Absorbe B1** (tracing end-to-end): la tabla `traces` casera queda como baseline frente a la instrumentación OTel estándar.
- **(c) A4 query rewriting / HyDE** tras flag `QUERY_TRANSFORM=none|rewrite|hyde`, siguiendo el patrón de `RAG_RETRIEVAL_MODE` / `RERANK_PROVIDER`.
- **(d) B3 elevado**: heurística anti-injection + `evals/adversarial.jsonl` con PDFs hostiles sintéticos, midiendo attack success rate antes/después.

## Nivel 3 — Opcional

- **C2 streaming de estado del agente** (`thinking… → searching… → found N chunks → writing`). Hacer justo antes de grabar el GIF de demo.
- **B2 cache semántica** de respuestas.
- **C1 en versión mínima**: cita clicable que abre el PDF en la página citada (el visor con highlight es esfuerzo L, queda fuera).
- **C3 multimodal** (vision para capturas de pizarra).
- **Resumen jerárquico** para documentos largos (subir a Nivel 2 si la demo usa PDFs grandes).
- **Descartados por ahora** (sin señal para el puesto): export real a Anki (`.apkg`) y compartir documentos entre usuarios.

---

## Historia detallada (capas ya implementadas)

## Fiabilidad — hecho en código, pendiente de validar en despliegue

- Cola de ingesta durable (`ingestion_jobs`) con claim atómico, retry y endpoint cron protegido.
- Rate limit de chat por usuario y protección de mensajes `system` enviados por cliente.
- Trazas sin contenido sensible para chat e ingesta; panel admin con métricas globales tras comprobar allowlist.
- Citas con título de documento y número de página cuando `pdf-parse` lo proporciona.
- CI, lint moderno, seed vacío y migración de `middleware.ts` a `proxy.ts`.

Pendiente operativo: aplicar migración 005 en Supabase remoto, configurar `CRON_SECRET` y comprobar la ejecución cron en Vercel.

## Fase A — RAG avanzado y evaluación

Objetivo: pasar de "RAG básico que funciona" a "RAG medible e iterable".

### A1. Harness de evaluación (`evals/`) — hecho
- Dataset etiquetado en `evals/dataset.jsonl`.
- Runner (`evals/runner.ts`) que ejecuta el pipeline real (`search_documents` + generación) sobre cada caso.
- Métricas de retrieval: `recall@k`, `MRR`, `hit_rate`.
- Métricas de generación: `faithfulness` y `answer_relevancy` con LLM-as-judge (`generateObject` sobre `gpt-4o-mini`).
- Output JSON en `evals/results/<timestamp>_<mode>.json` + tabla en consola.
- Scripts `npm run eval` y `npm run eval:compare`.

### A2. Hybrid search (vector + BM25) — hecho
- Migración `004_match_chunks_hybrid.sql`: columna generada `chunks.content_tsv`, índice GIN y RPC `match_chunks_hybrid` con Reciprocal Rank Fusion server-side.
- Capa `lib/ai/retrieval.ts` que rutea por modo (`vector` | `hybrid`), consumida por `lib/ai/tools.ts` y `evals/pipeline.ts`.
- Detrás de flag `RAG_RETRIEVAL_MODE` (default `vector`) para poder medir antes de flipear.
- Comparador `evals/compare.ts` (`npm run eval:compare`) que reporta delta agregado y casos que mejoran o regresan.
- Pendiente: aplicar la migración remota, correr eval en ambos modos y registrar el delta en el README.

### A3. Reranking con cross-encoder — hecho
- Capa `lib/ai/rerank.ts` con interfaz `Reranker` y dos implementaciones sin SDK nuevo:
  - `llm`: gpt-4o-mini puntúa listwise via `generateObject` (shuffle previo para mitigar position bias).
  - `cohere`: Cohere Rerank v3 multilingual via `fetch` (cross-encoder real, requiere `COHERE_API_KEY`).
- Integrado en `lib/ai/retrieval.ts`: over-fetch `topK * rerankCandidatePoolMultiplier` candidatos y reordena. Fallback graceful al orden original si el reranker lanza.
- Flag `RERANK_PROVIDER` (default `none`). Tests con reranker inyectable (incluido `null` para forzar desactivar).
- `RunReport` y `eval:compare` incluyen `rerank_provider` para diff de tres ejes (modo × reranker).
- Pendiente: correr eval en remoto en `vector/none`, `hybrid/none`, `hybrid/llm`, `hybrid/cohere` y publicar la matriz en el README.

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
