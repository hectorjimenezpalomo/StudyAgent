# AGENTS.md

Reglas que aplican al escribir código en este repo. Léelas una vez al empezar la sesión.

> Catálogo (tablas, rutas, tools, tipos): `ARCHITECTURE.md`. Trabajo pendiente: `ROADMAP.md`.

## Stack — versiones fijadas

- Next.js 16 App Router, React 19, TypeScript estricto, Node 20+
- `@supabase/ssr` para auth (no `@supabase/auth-helpers-nextjs`, deprecado)
- Vercel AI SDK v4: `ai`, `@ai-sdk/openai`, `@ai-sdk/react`
- `pdf-parse` para extracción, `zod` para validación

## Reglas absolutas

1. **API keys son server-only.** `OPENAI_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` no aparecen en archivos con `'use client'`.
2. **RLS obligatoria en cualquier tabla nueva**, en la misma migración que la crea. Política base: `user_id = auth.uid()`. Bucket: filtro por carpeta `(storage.foldername(name))[1] = auth.uid()::text`.
3. **Validación con zod en todo input externo**: bodies de API, parámetros de tools del agente, form data. Sin excepciones.
4. **Cliente Supabase correcto según contexto:**
   - `lib/supabase/client.ts` → componentes con `'use client'`
   - `lib/supabase/server.ts` → server components, route handlers, server actions
   - `lib/supabase/admin.ts` → solo lib server-side, cuando hay que saltarse RLS deliberadamente y tras haber validado al usuario por otra vía
5. **Configuración centralizada**: modelos en `lib/ai/config.ts`, prompts en `lib/ai/prompts.ts`. Nunca strings de modelo ni prompts en línea en rutas.
6. **Embeddings: dimensión 1536.** Si se cambia el modelo, migración nueva con `vector(N)` correcto y re-embedding completo. Mezclar dimensiones es un bug silencioso.
7. **TypeScript estricto, sin `any`.** APIs externas que devuelven `unknown` se narrow con zod, no con cast.
8. **Logs server-side con prefijo `[modulo/sub]`**: `[api/chat]`, `[ai/ingest]`, etc. Errores con `console.error`. Nunca devolver trazas al cliente.

## Tools del agente

Se crean con la factory `createAgentTools(context)` de `lib/ai/tools.ts`. El contexto inyecta `userId` y `allowedDocumentIds` para filtrado en profundidad encima de RLS. Toda tool nueva exige: schema zod, descripción accionable para el modelo (con cuándo usarla, no qué hace internamente), y entry en `ARCHITECTURE.md`.

## Procesos

- Antes de añadir tabla, ruta API o tool nueva: actualizar `ARCHITECTURE.md` en el mismo commit.
- Cambios a prompts: commit separado, mensaje `prompt(<nombre>): <cambio>`.
- Migraciones son inmutables tras commitearlas. Cualquier cambio = migración nueva.
- Commits en imperativo en inglés. El mensaje describe el cambio, no el método (no "use AI to refactor X").

## Decisiones que NO toma el agente

- Cambiar modelo de LLM o de embeddings.
- Cambiar dimensión del vector o cualquier esquema sin migración.
- Añadir dependencias nuevas a `package.json`.
- Cambiar políticas RLS o cualquier regla de este documento.

Para esas decisiones, propón en el PR y espera revisión.
