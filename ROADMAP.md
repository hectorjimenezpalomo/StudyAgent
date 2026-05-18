# ROADMAP

Plan de implementacion por fases. Cada fase es independiente y demoable. No saltar fases; cada una asume que la anterior funciona.

## Fase 0 - Bootstrap

- [x] Estructura de carpetas
- [x] `package.json` con dependencias fijadas
- [x] `tsconfig.json` con strict y alias `@/`
- [x] `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- [x] Migraciones SQL de Supabase (`001_initial_schema.sql`, `002_match_chunks.sql`)
- [x] `.env.example`
- [x] Tipos base en `lib/supabase/types.ts` y `types/index.ts`
- [x] Stubs de rutas API y paginas con tipos correctos
- [x] System prompt base en `lib/ai/prompts.ts`
- [x] Definicion de herramientas en `lib/ai/tools.ts`

## Fase 1 - Auth y subida de PDFs

- [x] Configurar clientes Supabase en `lib/supabase/client.ts` y `server.ts` con `@supabase/ssr`
- [x] Pagina `/login` con formulario email/password
- [x] Middleware que redirige a `/login` rutas protegidas
- [x] Pagina `/documents`: lista PDFs del usuario y permite subir
- [x] Ruta `POST /api/upload`: valida PDF, crea fila, sube a Storage y devuelve `{ document_id }`
- [x] Ruta `DELETE /api/documents/[id]`: borra storage + fila

## Fase 2 - Ingestion: extraer texto, chunkear, embebir

- [x] `lib/ai/chunker.ts`: `chunkText(text: string)` con 700 tokens y solape 100
- [x] `lib/ai/embeddings.ts`: embeddings en batches de hasta 100 inputs
- [x] `lib/ai/ingest.ts`: descarga PDF, extrae texto, chunkea, embebe, inserta chunks y marca `ready`
- [x] Llamar a `ingestDocument` desde `POST /api/upload`
- [x] UI con estados `pending`, `ingesting`, `ready`, `error` y polling

## Fase 3 - Chat con RAG manual

- [x] Pagina `/chat` con `useChat`
- [x] Ruta `POST /api/chat` con RAG manual contra `match_chunks`
- [x] Respuestas streameadas con citas `[Fuente N]`

## Fase 4 - Agente con tool calling

- [x] Convertir `/api/chat` a `streamText` con `tools`
- [x] Implementar `search_documents`
- [x] Implementar `generate_quiz`
- [x] Implementar `generate_summary`
- [x] Implementar `generate_flashcards`
- [x] Implementar `explain_concept`
- [x] Mantener system prompt del agente en `lib/ai/prompts.ts`
- [x] Mostrar tool calls con `ToolCallDisplay`
- [x] Renderizar quizzes y flashcards en burbujas especiales

## Fase 5 - Pulido y preparacion de demo

- [x] Pagina de inicio (`/`) con explicacion del producto, preview y CTA
- [x] Persistencia de conversaciones en `conversations` y `messages`
- [x] APIs `GET /api/conversations` y `GET /api/conversations/[id]`
- [x] Historial en `/chat` y boton de nuevo chat
- [x] Metricas basicas en `/admin` protegidas por `ADMIN_EMAILS`
- [x] Logs estructurados con prefijos consistentes
- [x] Tests Vitest para rutas y herramientas
- [x] Playwright E2E opt-in para login, upload, chat y recarga
- [x] README con setup, despliegue y placeholder de Loom
- [x] Variables de demo/admin/e2e en `.env.example`

## Fuera de alcance

- Multi-modal (vision, audio)
- Anki export real
- Compartir documentos entre usuarios
- Modelos locales con Ollama
- Internacionalizacion
- Sistema de planes/pagos
