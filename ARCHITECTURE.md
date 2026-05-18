# ARCHITECTURE.md

Catálogo técnico: nombres concretos de tablas, columnas, rutas, tipos, herramientas. Si vas a usar uno, búscalo aquí antes de inventártelo.

---

## Base de datos (Supabase + pgvector)

### Tablas

#### `profiles`
Extiende `auth.users`. Una fila por usuario, creada por trigger.

| columna | tipo | nullable | default | nota |
|---|---|---|---|---|
| `id` | `uuid` | no | — | FK a `auth.users.id`, PK |
| `email` | `text` | no | — | Sincronizado desde `auth.users` |
| `display_name` | `text` | sí | — | Para mostrar en UI |
| `created_at` | `timestamptz` | no | `now()` | |

#### `documents`
Un PDF subido por un usuario.

| columna | tipo | nullable | default | nota |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | no | — | FK a `profiles.id`, ON DELETE CASCADE |
| `title` | `text` | no | — | Nombre del archivo o título extraído |
| `storage_path` | `text` | no | — | Path en bucket `documents`. Formato: `<user_id>/<doc_id>.pdf` |
| `size_bytes` | `int` | no | — | Tamaño del archivo |
| `page_count` | `int` | sí | — | Rellenado durante la ingesta |
| `status` | `text` | no | `'pending'` | CHECK ∈ `('pending', 'ingesting', 'ready', 'error')` |
| `error_message` | `text` | sí | — | Si `status='error'`, qué pasó |
| `created_at` | `timestamptz` | no | `now()` | |
| `ingested_at` | `timestamptz` | sí | — | Cuándo terminó la ingesta |

Índice: `documents_user_id_idx ON (user_id)`.

#### `chunks`
Fragmentos de texto embebidos. Un PDF genera N chunks.

| columna | tipo | nullable | default | nota |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `document_id` | `uuid` | no | — | FK a `documents.id`, ON DELETE CASCADE |
| `user_id` | `uuid` | no | — | FK a `profiles.id`, denormalizado para RLS rápida |
| `content` | `text` | no | — | Texto del chunk |
| `chunk_index` | `int` | no | — | Orden dentro del documento (0-based) |
| `page_number` | `int` | sí | — | Página aproximada (puede ser null si no se puede inferir) |
| `embedding` | `vector(1536)` | no | — | Embedding de OpenAI text-embedding-3-small |
| `created_at` | `timestamptz` | no | `now()` | |

Índice vectorial: `chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)`.
Índice: `chunks_document_id_idx ON (document_id)`.

#### `conversations`
Sesiones de chat.

| columna | tipo | nullable | default | nota |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | no | — | FK |
| `title` | `text` | sí | — | Autogenerado a partir del primer mensaje |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | Actualizar en cada mensaje |

#### `messages`
Mensajes dentro de una conversación. Incluye user, assistant, tool calls y tool results.

| columna | tipo | nullable | default | nota |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `conversation_id` | `uuid` | no | — | FK ON DELETE CASCADE |
| `role` | `text` | no | — | CHECK ∈ `('user', 'assistant', 'tool')` |
| `content` | `jsonb` | no | — | Formato compatible con AI SDK: `[{ type: 'text', text: '...' }]` o tool calls/results |
| `tool_calls` | `jsonb` | sí | — | Si `role='assistant'` y hubo llamadas a herramientas |
| `created_at` | `timestamptz` | no | `now()` | |

### Funciones RPC

#### `match_chunks(query_embedding vector(1536), match_threshold float, match_count int, p_user_id uuid, p_document_ids uuid[] DEFAULT NULL)`

Devuelve los chunks más similares al embedding, filtrados por usuario y opcionalmente por documentos.

Retorno: `TABLE(id uuid, document_id uuid, content text, chunk_index int, page_number int, similarity float)`.

### RLS

Todas las tablas tienen RLS activado. Política única por tabla: `user_id = auth.uid()`. La RPC `match_chunks` se ejecuta con `SECURITY INVOKER` para respetar RLS.

### Storage

Bucket `documents` privado. Política: `(storage.foldername(name))[1] = auth.uid()::text`. Es decir, cada usuario solo accede a archivos cuyo path empieza por su `user_id`.

---

## Rutas API (route handlers)

| método | ruta | body | response | descripción |
|---|---|---|---|---|
| `POST` | `/api/upload` | `multipart/form-data` con campo `file` (PDF) | `{ document_id: string }` | Sube PDF, crea row en `documents`, dispara ingesta |
| `GET` | `/api/documents` | — | `Document[]` | Lista documentos del usuario |
| `DELETE` | `/api/documents/[id]` | — | `{ ok: true }` | Borra documento y chunks asociados |
| `GET` | `/api/documents/[id]/status` | — | `{ status, error_message? }` | Para polling durante ingesta |
| `POST` | `/api/chat` | `{ messages: UIMessage[], document_ids?: string[] }` | Stream de AI SDK | Endpoint del agente |
| `GET` | `/api/conversations` | — | `Conversation[]` | Histórico de conversaciones |
| `GET` | `/api/conversations/[id]` | — | `{ conversation, messages }` | Carga una conversación |

---

## Herramientas del agente

Definidas en `lib/ai/tools.ts`. Cada una se exporta con tipo `Tool` del AI SDK.

| nombre | parámetros | qué hace |
|---|---|---|
| `search_documents` | `query: string, document_ids?: string[], top_k?: number` | RAG. Embedea la query, llama `match_chunks`, devuelve los chunks ordenados por similitud. |
| `generate_quiz` | `topic: string, num_questions: number (1-20), document_ids?: string[]` | Hace RAG sobre el topic, llama al LLM para generar preguntas con 4 opciones y respuesta correcta. Devuelve JSON estructurado. |
| `generate_summary` | `document_id: string, length: 'short' \| 'medium' \| 'long'` | Trae todos los chunks del documento, los pasa al LLM para que genere resumen del largo pedido. |
| `generate_flashcards` | `topic: string, num_cards: number (1-30), document_ids?: string[]` | RAG + generación de pares pregunta/respuesta cortas. |
| `explain_concept` | `concept: string, level: 'beginner' \| 'intermediate' \| 'advanced', document_ids?: string[]` | RAG + explicación adaptada al nivel pedido. |

---

## Variables de entorno

Ver `.env.example`. Resumen:

- `NEXT_PUBLIC_SUPABASE_URL` — pública
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — pública
- `SUPABASE_SERVICE_ROLE_KEY` — secreta, solo servidor
- `OPENAI_API_KEY` — secreta, solo servidor
- `OPENAI_CHAT_MODEL` — default `gpt-4o-mini`
- `OPENAI_EMBEDDING_MODEL` — default `text-embedding-3-small`
- `MAX_UPLOAD_BYTES` — default `26214400` (25 MB)

---

## Convenciones de carpetas

```
app/
  (auth)/          rutas de login y callback OAuth
  (app)/           rutas autenticadas: /chat, /documents
  api/             route handlers
components/
  chat/            componentes específicos del chat
  ui/              primitives reutilizables (botones, inputs)
lib/
  supabase/        clientes y tipos
  ai/              embeddings, chunker, tools, prompts, ingest, config
types/             tipos compartidos no derivados de Supabase
supabase/migrations/  SQL versionado
```
