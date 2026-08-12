# StudyAgent Roadmap

This roadmap describes user and maintainer outcomes, not delivery dates. GitHub
issues are the source of truth for scoped work.

## Status

- **Implemented**: available in the current codebase.
- **Experimental**: implemented behind configuration and not adopted as a
  quality-improving default without representative evaluation.
- **Planned**: not implemented.

## Now

- **Implemented — OSS maintenance foundation:** MIT licensing, contribution and
  security policies, issue/PR templates, CI, Dependabot, CodeQL, release notes,
  and a documented release process.
- **Implemented — Reproducible local checks:** exact setup documentation,
  dependency locks, a secret-safe doctor command, and a deterministic demo
  fixture.
- **Planned — Public evaluation baseline:** publish a redistributable corpus and
  repeatable vector baseline ([#5](https://github.com/hectorjimenezpalomo/StudyAgent/issues/5)).
- **Planned — Demo media:** capture real, sanitized screenshots and a short
  walkthrough from the documented script ([#7](https://github.com/hectorjimenezpalomo/StudyAgent/issues/7)).
- **Planned — Accessibility review:** audit the critical product flows and fix
  verified barriers ([#6](https://github.com/hectorjimenezpalomo/StudyAgent/issues/6)).

## Next

- **Planned — Page-aware citations:** securely open a private PDF at the cited
  page ([#1](https://github.com/hectorjimenezpalomo/StudyAgent/issues/1)).
- **Planned — Adversarial evaluation:** measure prompt-injection attack success
  with original hostile fixtures ([#2](https://github.com/hectorjimenezpalomo/StudyAgent/issues/2)).
- **Planned — Query transforms:** compare direct, rewrite, and HyDE retrieval
  behind a safe default-off flag ([#3](https://github.com/hectorjimenezpalomo/StudyAgent/issues/3)).
- **Planned — Standard tracing:** add optional OpenTelemetry with a strict
  privacy boundary ([#4](https://github.com/hectorjimenezpalomo/StudyAgent/issues/4)).
- **Planned — International UI:** add English UI localization while retaining
  Spanish and unchanged prompt defaults ([#10](https://github.com/hectorjimenezpalomo/StudyAgent/issues/10)).

## Later

- **Planned — Hierarchical summaries:** bound context, latency, and cost for
  large documents ([#9](https://github.com/hectorjimenezpalomo/StudyAgent/issues/9)).
- **Planned — Cross-platform MCP onboarding:** test macOS and Linux client setup
  ([#8](https://github.com/hectorjimenezpalomo/StudyAgent/issues/8)).
- **Planned — Semantic response cache:** evaluate tenant-scoped cache quality,
  invalidation, privacy, and cost before adding schema.
- **Planned — Multimodal ingestion:** ingest images or scanned notes through an
  explicitly evaluated vision/OCR path.
- **Planned — Visible agent progress:** communicate searching and writing states
  without exposing hidden reasoning.

## Current product state

Implemented today: email/password auth, private PDF Storage, durable ingestion,
1536-dimensional embeddings, vector retrieval, structured study tools,
citations with page metadata, persistent conversations, feedback, rate limits,
privacy-preserving traces, an allowlisted admin view, two eval harnesses, and a
local MCP server.

Experimental today: hybrid BM25 + RRF retrieval, LLM/Cohere reranking, and
Gemini chat generation. These options exist for comparison; the project does
not claim they improve quality without corpus-specific results.

Operational validation still belongs to each deployer: apply all migrations,
configure `CRON_SECRET`, verify the scheduled worker, and exercise the private
Storage/RLS boundary in the target Supabase project.

## Proposing work

Open an issue with a concrete problem and acceptance criteria. Database, RLS,
model, embedding, dependency, prompt, and agent-tool changes must follow the
review rules in `AGENTS.md` and `CONTRIBUTING.md`.
