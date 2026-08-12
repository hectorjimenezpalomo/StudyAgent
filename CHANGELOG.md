# Changelog

All notable changes to StudyAgent are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project follows semantic versioning for public releases.

## [Unreleased]

### Added

- Open-source governance, contribution, security, and community-health files.
- Reproducible setup checks, demo documentation, and maintenance automation.

## [0.1.0] - 2026-08-12

### Added

- Email/password authentication with private, user-scoped PDF storage.
- Durable PDF ingestion with extraction, chunking, OpenAI embeddings, retries,
  and status polling.
- RAG chat with source metadata, structured quizzes and flashcards, summaries,
  explanations, and persistent conversations.
- Vector retrieval, experimental hybrid BM25 plus RRF retrieval, and optional
  LLM or Cohere reranking.
- OpenAI or Gemini chat generation while retaining 1536-dimensional OpenAI
  embeddings.
- TypeScript and Python/Ragas evaluation harnesses and a manual GitHub Actions
  evaluation workflow.
- Local stdio MCP server exposing the five user-scoped study tools.
- Privacy-preserving operational traces, user feedback, rate limiting, and an
  allowlisted admin view.

### Known limitations

- The product UI is currently Spanish-only.
- Scanned PDFs require OCR before upload.
- Citation links identify the document and page but do not open an embedded PDF
  viewer at that page.
- No public evaluation corpus, published baseline, or hosted demo is available.
- The MCP server is single-user and local-only.

[Unreleased]: https://github.com/hectorjimenezpalomo/StudyAgent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hectorjimenezpalomo/StudyAgent/releases/tag/v0.1.0
