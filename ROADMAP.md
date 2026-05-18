# ROADMAP

Plan de implementación por fases. Cada fase es independiente y demoable. No saltar fases; cada una asume que la anterior funciona.

## Fase 0 — Bootstrap (ya hecho en el esqueleto)

- [x] Estructura de carpetas
- [x] `package.json` con dependencias fijadas
- [x] `tsconfig.json` con strict y alias `@/`
- [x] `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- [x] Migraciones SQL de Supabase (`001_initial_schema.sql`, `002_match_chunks.sql`)
- [x] `.env.example`
- [x] Tipos base en `lib/supabase/types.ts` y `types/index.ts`
- [x] Stubs de rutas API y páginas con tipos correctos
- [x] System prompt base en `lib/ai/prompts.ts`
- [x] Definición de herramientas (esqueletos) en `lib/ai/tools.ts`

## Fase 1 — Auth y subida de PDFs (objetivo: poder subir un PDF y verlo listado)

- [ ] Configurar clientes Supabase en `lib/supabase/client.ts` y `server.ts` siguiendo el patrón `@supabase/ssr`
- [ ] Página `/login` con Supabase Auth UI o formulario propio (email + Google opcional)
- [ ] Middleware `middleware.ts` que redirige a `/login` rutas protegidas
- [ ] Página `/documents`: lista PDFs del usuario y permite subir
- [ ] Ruta `POST /api/upload`:
  - [ ] Validar tamaño y mime-type
  - [ ] Guardar archivo en Supabase Storage en bucket `documents/<user_id>/<doc_id>.pdf`
  - [ ] Insertar fila en `documents` con `status: 'pending'`
  - [ ] Devolver `{ document_id }`
- [ ] Ruta `DELETE /api/documents/[id]`: borra storage + fila

## Fase 2 — Ingestion: extraer texto, chunkear, embebir

- [ ] `lib/ai/chunker.ts`: función `chunkText(text: string): Chunk[]` con tamaño 700 tokens y solape 100
- [ ] `lib/ai/embeddings.ts`: función `embed(texts: string[]): Promise<number[][]>` que llama a OpenAI en batch (hasta 100 inputs por llamada)
- [ ] `lib/ai/ingest.ts`: función `ingestDocument(documentId: string)` que:
  - [ ] Descarga el PDF de Storage
  - [ ] Extrae texto con `pdf-parse`
  - [ ] Chunkea
  - [ ] Embedea
  - [ ] Inserta filas en `chunks`
  - [ ] Actualiza `documents.status = 'ready'`
- [ ] Llamar a `ingestDocument` desde `POST /api/upload` después de guardar el archivo
- [ ] En la UI, mostrar estado del documento (`pending`, `ready`, `error`) con polling cada 2s mientras esté `pending`

## Fase 3 — Chat con RAG (sin agente todavía)

- [ ] Página `/chat`: interfaz de chat con `useChat` del AI SDK
- [ ] Ruta `POST /api/chat`:
  - [ ] Recibe `messages`
  - [ ] Toma el último mensaje del usuario, lo embedea
  - [ ] Llama a `match_chunks` con el embedding del usuario
  - [ ] Construye el prompt con los chunks como contexto (formato definido en `lib/ai/prompts.ts`)
  - [ ] Llama a `streamText` con el prompt y devuelve el stream
- [ ] En la UI, mostrar las fuentes citadas debajo de cada respuesta (extraer de los chunks usados)

## Fase 4 — Agente con tool calling (el salto cualitativo)

- [ ] Convertir `/api/chat` a usar `streamText` con `tools` en lugar de RAG manual
- [ ] Implementar las herramientas de `lib/ai/tools.ts`:
  - [ ] `search_documents(query, document_ids?)`: hace el RAG y devuelve chunks
  - [ ] `generate_quiz(topic, num_questions)`: hace RAG → pide al modelo que genere preguntas con respuestas
  - [ ] `generate_summary(document_id, length)`: trae todo el doc, lo pide resumir
  - [ ] `generate_flashcards(topic, num_cards)`: RAG + generación de pares pregunta/respuesta
  - [ ] `explain_concept(concept, level)`: RAG + explicación adaptada al nivel
- [ ] El system prompt se actualiza para explicar al modelo qué herramientas tiene y cuándo usarlas
- [ ] UI: componente `ToolCallDisplay.tsx` que muestra cuando el agente invoca una herramienta, qué argumentos pasó y qué devolvió
- [ ] Quizzes y flashcards renderizan en burbujas especiales en la UI, no como texto plano

## Fase 5 — Pulido y despliegue

- [ ] Página de inicio (`/`) con explicación del producto, capturas y CTA
- [ ] Persistencia de conversaciones en `conversations` y `messages` para que el usuario pueda volver a hilos pasados
- [ ] Métricas básicas: contar tokens por mensaje, mostrar coste estimado en el panel de admin (oculto detrás de un flag de email)
- [ ] Logs estructurados con prefijos consistentes (`[api/chat]`, `[ai/ingest]`, ...) para que sean grepables
- [ ] Tests:
  - [ ] `vitest` para `chunker.ts`, `embeddings.ts` mock, validación de schemas zod
  - [ ] `playwright` con un test e2e: login con cuenta de prueba → subir PDF → preguntar algo → ver respuesta
- [ ] README con vídeo demo de 2-3 minutos en Loom
- [ ] Despliegue en Vercel con variables de entorno configuradas
- [ ] Dos o tres PDFs públicos de ejemplo precargados en una cuenta de demo (con `DEMO_USER_EMAIL` en `.env`) para que un reclutador pueda probar sin subir sus propios documentos

## Fuera de alcance (no hacer en esta primera versión)

- Multi-modal (visión, audio)
- Anki export real (las flashcards generadas se quedan en la UI)
- Compartir documentos entre usuarios
- Modelos locales con Ollama
- Internacionalización
- Sistema de planes/pagos
