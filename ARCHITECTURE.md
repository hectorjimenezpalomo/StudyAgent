# ARCHITECTURE.md

Catálogo técnico. Si vas a usar un nombre (tabla, columna, ruta, tipo, tool), búscalo aquí antes de inventarlo.

## Tablas

| tabla | claves notables | nota |
|---|---|---|
| `profiles` | `id` (FK a `auth.users`), `email`, `display_name` | Una fila por usuario, creada por trigger `on_auth_user_created` |
| `documents` | `id`, `user_id`, `title`, `storage_path`, `size_bytes`, `page_count`, `status`, `error_message`, `ingested_at` | `status` ∈ `pending` \| `ingesting` \| `ready` \| `error` |
| `chunks` | `id`, `document_id`, `user_id`, `content`, `chunk_index`, `page_number`, `embedding vector(1536)` | Índice HNSW cosine en `embedding`. `user_id` denormalizado para RLS rápida |
| `conversations` | `id`, `user_id`, `title`, `updated_at` | Listado en sidebar de `/chat` |
| `messages` | `id`, `conversation_id`, `role`, `content` (jsonb), `tool_calls` (jsonb) | `role` ∈ `user` \| `assistant` \| `tool` |
| `ingestion_jobs` | `document_id` único, `user_id`, `status`, `attempts`, `next_attempt_at`, `locked_at` | Cola durable de PDFs; el worker service-role reclama jobs atómicamente y reintenta hasta `max_attempts` |
| `chat_rate_limits` | `user_id`, `window_started_at`, `request_count` | Ventana fija por usuario; solo se modifica a través de RPC que deriva `auth.uid()` |
| `trace_events` | `request_id`, `user_id`, `stage`, `latency_ms`, tokens, coste, metadata | Metadatos operativos sin prompts, respuestas ni texto de PDFs |
| `message_feedback` | `user_id`, `message_id`, `rating`, `note` | Una valoración útil/no útil por usuario y mensaje; valida propiedad del mensaje en la ruta API |

RLS activa en todas. Política base: `user_id = auth.uid()` (en `messages`, vía join con `conversations`). `ingestion_jobs`, `chat_rate_limits` y `trace_events` no aceptan mutación directa del cliente fuera de sus rutas/RPCs previstas.

## Funciones RPC

| nombre | firma | uso |
|---|---|---|
| `match_chunks` | `(query_embedding vector(1536), match_threshold float, match_count int, p_user_id uuid, p_document_ids uuid[])` | Búsqueda vectorial filtrada por usuario. `security invoker`, respeta RLS |
| `match_chunks_hybrid` | `(query_text text, query_embedding vector(1536), match_count int, candidate_multiplier int, rrf_k int, p_user_id uuid, p_document_ids uuid[])` | Búsqueda híbrida pgvector + BM25 (`tsvector` con config `simple`) fusionada server-side con Reciprocal Rank Fusion. `security invoker`. Requiere migración 004 |
| `consume_chat_rate_limit` | `(p_limit int, p_window_seconds int)` | Consume una cuota fija para `auth.uid()` y devuelve `{ allowed, retry_after_seconds }` |
| `claim_ingestion_job` | `(p_worker_id text)` | Reclama un job elegible con `FOR UPDATE SKIP LOCKED`. Solo `service_role` |
| `complete_ingestion_job` | `(p_job_id uuid)` | Marca una ingesta completada. Solo `service_role` |
| `retry_ingestion_job` | `(p_job_id uuid, p_error text, p_retry_delay_seconds int)` | Programa retry exponencial o estado `failed`. Solo `service_role` |

## Rutas API

| método | ruta | request | response |
|---|---|---|---|
| POST | `/api/upload` | `multipart/form-data` con `file` | `{ document_id }` |
| GET | `/api/documents` | — | `{ documents: Document[] }` |
| DELETE | `/api/documents/[id]` | — | `{ ok: true }` |
| GET | `/api/documents/[id]/status` | — | `{ status, error_message? }` |
| POST | `/api/chat` | `{ messages, document_ids?, conversation_id? }` | Data stream del AI SDK, cabecera `x-conversation-id` |
| POST | `/api/feedback` | `{ message_id, rating, note? }` | `{ ok: true }`; requiere que el mensaje pertenezca al usuario |
| GET / POST | `/api/internal/ingest` | `Authorization: Bearer $CRON_SECRET` | Procesa como máximo un job de ingesta; endpoint para Vercel Cron |
| GET | `/api/conversations` | — | `{ conversations: ConversationSummary[] }` |
| GET | `/api/conversations/[id]` | — | `{ conversation, messages }` |

## Tools del agente

Definidas en `lib/ai/tools.ts` y compuestas con `createAgentTools(context)`.

| tool | parámetros | qué hace |
|---|---|---|
| `search_documents` | `query`, `document_ids?`, `top_k?` | Si la query menciona una página explícita (`pagina 1`, `page 1`), carga chunks por `page_number`; si no, embedea la query, llama `match_chunks` y devuelve chunks ordenados con `{document_title, page_number, chunk_id}` como fuentes. Si el retrieval vectorial queda vacío, usa un fallback léxico acotado a documentos permitidos con alias básicos español→inglés (`diseño→design`, `análisis→analysis`, etc.) |
| `generate_quiz` | `topic`, `num_questions`, `document_ids?` | RAG + `generateObject` con schema de `QuizQuestion[]` y fuentes recuperadas |
| `generate_summary` | `document_id`, `length` | Carga todos los chunks del doc, resumen con `generateText` y fuente del documento |
| `generate_flashcards` | `topic`, `num_cards`, `document_ids?` | RAG + `generateObject` con schema de `Flashcard[]` y fuentes recuperadas |
| `explain_concept` | `concept`, `level`, `document_ids?` | RAG + `generateText` con prompt ajustado al nivel y fuentes recuperadas |

## Servidor MCP

`mcp-server/` expone las 5 tools del agente como servidor MCP stdio (reutiliza
`createAgentTools`). `mcp-server/context.ts` valida el entorno (`loadMcpConfig`) y
construye el `AgentToolContext` para un `MCP_USER_ID` fijo (`buildAgentToolContext`),
cargando sus documentos `ready` vía service-role. `mcp-server/index.ts` registra
cada tool con su mismo schema zod. Script `npm run mcp`. Detalles y seguridad
(salta RLS, nunca exponer a red) en `docs/mcp.md` y `docs/adr/0003`.

## Variables de entorno

Server (secretas):
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_PROVIDER` (default `openai`, valores: `openai` | `google`). Conmuta el proveedor de chat/generación en todo el sistema vía la factoría `lib/ai/provider.ts::getChatModel()`. Los embeddings NO dependen de esto (siempre OpenAI). Ver `docs/adr/0001`
- `OPENAI_API_KEY` (obligatoria siempre: los embeddings usan OpenAI aunque `AI_PROVIDER=google`)
- `OPENAI_CHAT_MODEL` (default `gpt-4o-mini`)
- `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`)
- `GOOGLE_GENERATIVE_AI_API_KEY` (requerida si `AI_PROVIDER=google`; API key gratuita en https://aistudio.google.com/apikey)
- `GOOGLE_CHAT_MODEL` (default `gemini-2.0-flash`; modelo usado cuando `AI_PROVIDER=google`)
- `MAX_UPLOAD_BYTES` (default `26214400`)
- `CHAT_REQUESTS_PER_MINUTE` (default `20`)
- `CHAT_INPUT_COST_USD_PER_MILLION` y `CHAT_OUTPUT_COST_USD_PER_MILLION` (default `0`; tarifa configurada para trazas)
- `CRON_SECRET` (obligatorio para `/api/internal/ingest`)
- `ADMIN_EMAILS` (lista separada por comas)
- `RAG_RETRIEVAL_MODE` (default `vector`, valores: `vector` | `hybrid`). Si se pone `hybrid`, la migración 004 tiene que estar aplicada
- `RERANK_PROVIDER` (default `none`, valores: `none` | `llm` | `cohere`). Activa la etapa de reranking post-retrieval
- `RERANK_LLM_MODEL` (opcional, default `gpt-4o-mini`). Modelo usado por el reranker `llm`
- `COHERE_API_KEY` (requerido si `RERANK_PROVIDER=cohere`)
- `COHERE_RERANK_MODEL` (opcional, default `rerank-multilingual-v3.0`)

Cliente (públicas):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

## Storage

Bucket `documents`, privado, límite 25 MB, mime permitido `application/pdf`. Path: `<user_id>/<document_id>.pdf`. Políticas en `supabase/migrations/003_documents_storage.sql`.

## Configuración central

`lib/ai/config.ts` (AI_CONFIG):
- `provider` ('openai' por defecto, override via `AI_PROVIDER`), `chatModel`, `googleChatModel` (default `gemini-2.0-flash`), `embeddingModel`, `embeddingDimensions: 1536`
- `lib/ai/provider.ts::getChatModel(modelId?)`: factoría del modelo de chat según `provider`. ÚNICO punto que importa el SDK de proveedor (`@ai-sdk/openai` / `@ai-sdk/google`); migrar a Vertex se hace solo aquí
- `rag`: `chunkSizeTokens=700`, `chunkOverlapTokens=100`, `matchThreshold=0.5`, `matchCount=8`, `retrievalMode` ('vector' por defecto, override via `RAG_RETRIEVAL_MODE`), `hybridRRFConstant=60`, `hybridCandidateMultiplier=4`, `rerankProvider` ('none' por defecto, override via `RERANK_PROVIDER`), `rerankCandidatePoolMultiplier=3`, `rerankLlmModel` (override via `RERANK_LLM_MODEL`)
- `agent`: `maxSteps=5`, `maxTokensPerResponse=2000`
- `limits`: `maxUploadBytes`, `maxQuizQuestions=20`, `maxFlashcards=30`

## Evaluación

Harness offline en `evals/`. Mide el pipeline RAG core (`embed → match_chunks → generateText`) contra un dataset etiquetado y reporta retrieval (recall@k, MRR, hit_rate@k), generation (faithfulness, answer_relevancy via LLM-as-judge) y latencia.

| archivo | rol |
|---|---|
| `evals/dataset.jsonl` | Casos: `{id, question, ground_truth_answer, ground_truth_chunk_ids[], document_ids[]}` |
| `evals/types.ts` | Schemas zod y tipos del reporte |
| `evals/metrics.ts` | `recallAtK`, `meanReciprocalRank`, `hitRateAtK`, `average`, `percentile` (puras) |
| `evals/judge.ts` | LLM-as-judge: `judgeFaithfulness`, `judgeAnswerRelevancy` |
| `evals/pipeline.ts` | `runPipeline(supabase, userId, question, documentIds)` |
| `evals/runner.ts` | CLI entry, ejecutable con `npm run eval` |
| `evals/compare.ts` | Compara dos `RunReport` con configs distintas (modo o reranker), ejecutable con `npm run eval:compare` |
| `evals/results/` | `<timestamp>_<mode>_<rerank>_<provider>.json` por run, gitignored |

Detalles operativos en `evals/README.md`.

## Estructura

```
app/
  (auth)/        login, callback OAuth
  (app)/         rutas autenticadas: chat, documents, admin
  api/           route handlers
components/
  chat/          ChatInterface, ToolCallDisplay
  documents/     UploadButton, DeleteDocumentButton, DocumentsPolling
  auth/          LoginForm
lib/
  supabase/      client.ts, server.ts, admin.ts, types.ts (generado)
  ai/            chunker, embeddings, ingest, ingestion-jobs, tools, retrieval, rerank, prompts, provider, config
  observability/  traces de metadatos operativos
  chat/          persistence (conversations + messages)
evals/           harness offline (npm run eval)
mcp-server/      servidor MCP stdio sobre las tools del agente (npm run mcp)
supabase/migrations/   001 schema, 002 match_chunks, 003 storage, 004 hybrid, 005 reliability
```
