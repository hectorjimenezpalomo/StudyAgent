# StudyAgent v0.1.0 — Evaluation-first private-document RAG

StudyAgent v0.1.0 is the first public release of an open-source RAG study assistant for private PDFs.

## Included

- Private PDF upload and durable ingestion with Supabase RLS and Storage policies.
- Vector retrieval, optional hybrid retrieval, optional LLM/Cohere reranking, and source metadata.
- Grounded chat plus quiz, summary, flashcard, and concept-explanation tools.
- Persisted conversations, feedback, operational metadata traces, and a local stdio MCP server.
- TypeScript and Python/Ragas evaluation harnesses, reproducible setup checks, and an original demo fixture.

Start with [the setup guide](../setup.md). Keep service-role and provider keys server-only, use only documents you are authorized to process, and treat MCP and evaluation outputs as sensitive.

## Evaluation status

The harnesses and metrics are implemented, but the committed public dataset is intentionally empty. This release does not claim a public quality baseline. A reproducible corpus and baseline are tracked in [issue #5](https://github.com/hectorjimenezpalomo/StudyAgent/issues/5).

## Known limitations

The UI and runtime prompts remain Spanish-only. There is no OCR, page-level citation viewer, public deployment, committed public evaluation corpus, or validated demo visual. MCP is single-user local stdio and must not be network-exposed.

