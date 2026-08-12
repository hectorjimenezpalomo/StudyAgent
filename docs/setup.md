# Setup

## Five-minute local path

Prerequisites: Node.js 20+, Docker, and the Supabase CLI.

```bash
npm ci
copy .env.example .env.local
supabase start
supabase db reset
npm run doctor
npm run dev
```

On macOS or Linux, use `cp .env.example .env.local`. Copy the local API URL, anon key, and service-role key printed by `supabase status` into `.env.local`, add an OpenAI API key, and replace `CRON_SECRET` with a long random value. Open `http://localhost:3000`, create a local account, and upload a PDF.

## Full setup

### Environment mapping

The minimum app needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_APP_URL`, and `CRON_SECRET`. `.env.example` documents optional Google chat, Cohere/LLM reranking, hybrid retrieval, admin, E2E, and MCP settings. OpenAI remains required for embeddings when Google supplies chat generation.

Keep service-role and provider keys server-only. Never expose them through `NEXT_PUBLIC_*`, browser code, screenshots, issues, logs, or evaluation results.

### Supabase and authentication

`supabase start` launches the local stack. `supabase db reset` applies every committed migration, including RLS and the private `documents` bucket. Use local email/password authentication through the app. Inspect service URLs and development keys with `supabase status`.

Uploaded documents enter a durable queue. In development, process one job with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/ingest
```

PowerShell equivalent:

```powershell
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:CRON_SECRET" } http://localhost:3000/api/internal/ingest
```

### Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

E2E additionally requires running Supabase, valid OpenAI credentials, an existing `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`, the application, and `CRON_SECRET`. Run `npm run test:e2e`; the test uploads its fixture, invokes ingestion, polls readiness, verifies persisted chat, and removes the document.

### MCP

Set `MCP_USER_ID` to the UUID of the local user whose ready documents may be exposed, then run `npm run doctor -- --mcp` and `npm run mcp`. The server uses service-role access and must remain a trusted local stdio process. See [MCP setup](mcp.md).

### Evaluations

The TypeScript harness uses the private Supabase corpus referenced by `evals/dataset.jsonl`:

```bash
npm run eval
```

Do not report results while the committed dataset is empty. Result files can contain questions, answers, and retrieved private text; keep them out of version control.

For the Python/Ragas harness, install Python and `uv`:

```bash
cd evals-py
uv sync --frozen
uv run pytest
uv run python -m evals_py.runner
```

