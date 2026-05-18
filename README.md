# StudyAgent

Asistente de estudio con IA basado en PDFs privados. Permite subir documentos,
ingerirlos con embeddings, chatear con RAG, usar herramientas del agente, generar
quizzes/flashcards y volver a conversaciones pasadas.

## Stack

- Next.js 16 + React 19 + TypeScript
- Supabase Auth, Postgres, Storage y pgvector
- Vercel AI SDK v4 con tool calling
- OpenAI `gpt-4o-mini` y `text-embedding-3-small`
- Vitest y Playwright

## Setup Local

```bash
npm install
cp .env.example .env.local
```

Rellena `.env.local` con Supabase y OpenAI:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
ADMIN_EMAILS=tu-email@example.com
DEMO_USER_EMAIL=demo@example.com
E2E_USER_EMAIL=demo@example.com
E2E_USER_PASSWORD=...
```

Con Supabase local:

```bash
supabase start
supabase db reset
npm run db:types
```

Arranca la app:

```bash
npm run dev
```

## Verificacion

```bash
npm run typecheck
npm run test
npm run build
```

E2E recomendado antes de demo:

```bash
npm run test:e2e
```

El test E2E se omite automaticamente si no existen `E2E_USER_EMAIL` y
`E2E_USER_PASSWORD`.

## Demo

1. Crea o configura el usuario de demo indicado en `DEMO_USER_EMAIL`.
2. Inicia sesion con esa cuenta.
3. Sube dos o tres PDFs publicos de ejemplo desde `/documents`.
4. Espera a que queden en estado `ready`.
5. En `/chat`, pregunta, pide un resumen, genera un quiz y crea flashcards.
6. Recarga el hilo para comprobar que la conversacion persiste.

Video Loom: pendiente de grabar tras desplegar la version final.

## Despliegue en Vercel

1. Crea un proyecto Supabase remoto y aplica las migraciones de `supabase/migrations/`.
2. Configura el bucket privado `documents` y las politicas incluidas en las migraciones.
3. En Vercel, configura las variables de `.env.example`.
4. Despliega `main`.
5. Verifica `/login`, `/documents`, `/chat` y `/admin` con un email incluido en `ADMIN_EMAILS`.

## Documentacion

- `AGENTS.md`: reglas obligatorias de implementacion.
- `ARCHITECTURE.md`: tablas, rutas, tipos y herramientas.
- `ROADMAP.md`: fases del proyecto.
