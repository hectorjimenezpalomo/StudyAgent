# 0001 — Multi-provider chat (OpenAI ↔ Gemini)

## Context

The application originally used only OpenAI. Supporting comparable providers through the same evaluation harness should not require rewriting the pipeline. Vertex AI is not currently viable because it requires a GCP project and service credentials that the maintainer does not have.

## Decision

- Add `AI_PROVIDER=openai|google` (default `openai`) and make `lib/ai/provider.ts::getChatModel()` the only provider-aware factory. Every chat and generation call site uses it.
- Use Gemini through Google AI Studio (`@ai-sdk/google` and `GOOGLE_GENERATIVE_AI_API_KEY`), not `@ai-sdk/google-vertex`. A future Vertex migration should require changing only the provider factory.
- Keep `@ai-sdk/google` on major version 1 for compatibility with `ai@^4`; version 2 requires AI SDK 5.
- Do not migrate embeddings. They remain OpenAI `text-embedding-3-small` at 1536 dimensions. The HNSW index is fixed at 1536 dimensions, so changing it requires full corpus re-ingestion under rule 6 of `AGENTS.md`. `OPENAI_API_KEY` remains required with Google chat.

## Consequences

- The existing harness can compare a `provider × retrieval_mode × reranker` matrix.
- The LLM reranker and evaluation judge inherit the active provider; the reranker default is not hard-coded to an OpenAI model under Google.
- Adding the provider dependency was a human-owned decision recorded here and in its commit, as required by `AGENTS.md`.

