# AGENTS.md

Rules that apply when writing code in this repository. Read them once at the start of a session.

> Catalog (tables, routes, tools, types): `ARCHITECTURE.md`. Pending work: `ROADMAP.md`.

## Stack — pinned versions

- Next.js 16 App Router, React 19, strict TypeScript, Node 20+
- `@supabase/ssr` for auth (not the deprecated `@supabase/auth-helpers-nextjs`)
- Vercel AI SDK v4: `ai`, `@ai-sdk/openai`, `@ai-sdk/react`
- `pdf-parse` for extraction, `zod` for validation

## Non-negotiable rules

1. **API keys are server-only.** `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must never appear in files containing `'use client'`.
2. **RLS is mandatory for every new table**, in the same migration that creates it. Base policy: `user_id = auth.uid()`. Bucket policy: folder filter `(storage.foldername(name))[1] = auth.uid()::text`.
3. **Validate every external input with zod**: API bodies, agent-tool parameters, and form data. No exceptions.
4. **Use the correct Supabase client for each context:**
   - `lib/supabase/client.ts` → components containing `'use client'`
   - `lib/supabase/server.ts` → Server Components, route handlers, and Server Actions
   - `lib/supabase/admin.ts` → server-only libraries, when deliberately bypassing RLS after validating the user through another path
5. **Centralize configuration**: models in `lib/ai/config.ts`, prompts in `lib/ai/prompts.ts`. Never place model strings or inline prompts in routes.
6. **Embedding dimension: 1536.** Changing the model requires a new migration with the correct `vector(N)` and a full re-embedding. Mixing dimensions is a silent bug.
7. **Strict TypeScript, no `any`.** Narrow `unknown` values returned by external APIs with zod, not casts.
8. **Prefix server-side logs with `[module/submodule]`**: `[api/chat]`, `[ai/ingest]`, and so on. Use `console.error` for errors. Never return stack traces to clients.

## Agent tools

Create them with the `createAgentTools(context)` factory in `lib/ai/tools.ts`. The context injects `userId` and `allowedDocumentIds` for defense-in-depth filtering on top of RLS. Every new tool requires a zod schema, an actionable model-facing description that says when to use it rather than how it works internally, and an entry in `ARCHITECTURE.md`.

## Process

- Before adding a table, API route, or tool, update `ARCHITECTURE.md` in the same commit.
- Prompt changes require a separate commit with message `prompt(<name>): <change>`.
- Migrations are immutable once committed. Every change requires a new migration.
- Write imperative commit messages in English. Describe the change, not the method (do not write "use AI to refactor X").

## Decisions an agent must NOT make

- Change the LLM or embedding model.
- Change the vector dimension or any schema without a migration.
- Add dependencies to `package.json`.
- Change RLS policies or any rule in this document.

Propose those decisions in a pull request and wait for review.
