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

RLS activa en todas. Política única: `user_id = auth.uid()` (en `messages`, vía join con `conversations`).

## Funciones RPC

| nombre | firma | uso |
|---|---|---|
| `match_chunks` | `(query_embedding vector(1536), match_threshold float, match_count int, p_user_id uuid, p_document_ids uuid[])` | Búsqueda vectorial filtrada por usuario. `security invoker`, respeta RLS |
| `match_chunks_hybrid` | `(query_text text, query_embedding vector(1536), match_count int, candidate_multiplier int, rrf_k int, p_user_id uuid, p_document_ids uuid[])` | Búsqueda híbrida pgvector + BM25 (`tsvector` con config `simple`) fusionada server-side con Reciprocal Rank Fusion. `security invoker`. Requiere migración 004 |

## Rutas API

| método | ruta | request | response |
|---|---|---|---|
| POST | `/api/upload` | `multipart/form-data` con `file` | `{ document_id }` |
| GET | `/api/documents` | — | `{ documents: Document[] }` |
| DELETE | `/api/documents/[id]` | — | `{ ok: true }` |
| GET | `/api/documents/[id]/status` | — | `{ status, error_message? }` |
| POST | `/api/chat` | `{ messages, document_ids?, conversation_id? }` | Data stream del AI SDK, cabecera `x-conversation-id` |
| GET | `/api/conversations` | — | `{ conversations: ConversationSummary[] }` |
| GET | `/api/conversations/[id]` | — | `{ conversation, messages }` |

## Tools del agente

Definidas en `lib/ai/tools.ts` y compuestas con `createAgentTools(context)`.

| tool | parámetros | qué hace |
|---|---|---|
| `search_documents` | `query`, `document_ids?`, `top_k?` | Embedea la query, llama `match_chunks`, devuelve chunks ordenados por similitud |
| `generate_quiz` | `topic`, `num_questions`, `document_ids?` | RAG + `generateObject` con schema de `QuizQuestion[]` |
| `generate_summary` | `document_id`, `length` | Carga todos los chunks del doc, resumen con `generateText` |
| `generate_flashcards` | `topic`, `num_cards`, `document_ids?` | RAG + `generateObject` con schema de `Flashcard[]` |
| `explain_concept` | `concept`, `level`, `document_ids?` | RAG + `generateText` con prompt ajustado al nivel |

## Variables de entorno

Server (secretas):
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL` (default `gpt-4o-mini`)
- `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`)
- `MAX_UPLOAD_BYTES` (default `26214400`)
- `ADMIN_EMAILS` (lista separada por comas)
- `RAG_RETRIEVAL_MODE` (default `vector`, valores: `vector` | `hybrid`). Si se pone `hybrid`, la migración 004 tiene que estar aplicada

Cliente (públicas):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

## Storage

Bucket `documents`, privado, límite 25 MB, mime permitido `application/pdf`. Path: `<user_id>/<document_id>.pdf`. Políticas en `supabase/migrations/003_documents_storage.sql`.

## Configuración central

`lib/ai/config.ts` (AI_CONFIG):
- `chatModel`, `embeddingModel`, `embeddingDimensions: 1536`
- `rag`: `chunkSizeTokens=700`, `chunkOverlapTokens=100`, `matchThreshold=0.5`, `matchCount=8`, `retrievalMode` ('vector' por defecto, override via `RAG_RETRIEVAL_MODE`), `hybridRRFConstant=60`, `hybridCandidateMultiplier=4`
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
| `evals/compare.ts` | Compara dos `RunReport` (típicamente `vector` vs `hybrid`), ejecutable con `npm run eval:compare` |
| `evals/results/` | `<timestamp>_<mode>.json` por run, gitignored |

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
  ai/            chunker, embeddings, ingest, tools, retrieval, prompts, config
  chat/          persistence (conversations + messages)
evals/           harness offline (npm run eval)
supabase/migrations/   001 schema, 002 match_chunks, 003 storage
```
