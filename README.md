# StudyAgent

Asistente de estudio con IA basado en RAG y agentes. Sube tus apuntes en PDF, chatea con ellos, genera quizzes, resúmenes y fichas de repaso.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Supabase: PostgreSQL + pgvector + Auth + Storage
- Vercel AI SDK (streaming + tool calling)
- OpenAI: gpt-4o-mini (chat) + text-embedding-3-small (embeddings)
- Despliegue: Vercel

## Empezar

```bash
npm install
cp .env.example .env.local
# Rellenar .env.local con credenciales de Supabase y OpenAI
npm run dev
```

Para la base de datos, crear un proyecto en Supabase y aplicar las migraciones en orden desde `supabase/migrations/`. Activar la extensión `vector` si no está activa.

## Documentación

- `AGENTS.md` — reglas de codificación y arquitectura. Léelo antes de tocar nada.
- `ROADMAP.md` — fases de implementación.
- `ARCHITECTURE.md` — catálogo de tablas, rutas, tipos y herramientas del agente.

## Estado

Esqueleto. Las migraciones están completas, las dependencias fijadas, los stubs de las rutas tipados y la documentación del agente lista. La lógica de negocio (RAG, herramientas, UI de chat) está pendiente de implementar siguiendo `ROADMAP.md`.
