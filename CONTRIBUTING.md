# Contributing to StudyAgent

Thank you for helping improve StudyAgent. Contributions that make the project
more reliable, measurable, private, accessible, or easier to operate are
especially welcome.

## Before you start

1. Read `AGENTS.md` and `ARCHITECTURE.md` for repository invariants.
2. Search existing issues before opening a new one.
3. For a material change, open or claim an issue before writing code.
4. Never include real credentials, personal PDFs, production data, or eval
   outputs containing private document text.

## Local development

Follow [`docs/setup.md`](docs/setup.md). The short version is:

```bash
npm ci
cp .env.example .env.local
npm run doctor
supabase start
supabase db reset
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

## Making changes

- Branch from `main` and keep each pull request focused.
- Use imperative English commit messages that describe the change.
- Keep API keys server-only and validate every external input with Zod.
- Do not change model defaults, embedding dimensions, dependencies, database
  schema, or RLS policies without explicit maintainer review.
- Add a migration for every schema change; never edit a committed migration.
- Update `ARCHITECTURE.md` with any new table, API route, or agent tool.
- Put model configuration in `lib/ai/config.ts` and prompts in
  `lib/ai/prompts.ts`.

Changes to prompts must be isolated in their own commit with a message such as
`prompt(agent): clarify citation behavior`.

## Verification

Run the checks relevant to your change:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

For Python evaluation code:

```bash
cd evals-py
uv sync --frozen
uv run pytest
```

UI and critical-flow changes should also run `npm run test:e2e` with the
documented external services and test credentials. Changes to retrieval,
reranking, chunking, or generation should report before/after eval evidence
when a representative corpus is available. Never fabricate an eval result.

## Pull requests

Complete the pull request template. Explain what changed, why it is needed,
how it was tested, security/privacy implications, migration impact, and any
effect on retrieval or evaluation. Screenshots are useful for visible UI
changes but must not contain personal documents or credentials.

By contributing, you agree that your contribution is licensed under the MIT
License and that you will follow the project Code of Conduct.
