# GCP deployment mapping

StudyAgent is currently deployed-oriented for Vercel, Supabase and OpenAI. This
document is an implementation map, not a claim that the application already
runs on Google Cloud.

| Current boundary | GCP-compatible replacement | Reason to change |
|---|---|---|
| Next.js server | Cloud Run container | One deployable runtime for UI, APIs and protected worker routes |
| OpenAI chat/embeddings | Vertex AI Gemini + embedding provider adapter | Provider governance, regional controls or client requirements |
| Supabase Postgres + pgvector | Cloud SQL/AlloyDB with pgvector | Existing relational + vector workload at moderate scale |
| `ingestion_jobs` + cron | Cloud Run worker + Cloud Tasks/Pub/Sub | Higher-throughput retries and stronger delivery semantics |
| `trace_events` | Cloud Logging/Trace and BigQuery export | Centralized operations and longer retention |

## Migration sequence

1. Keep the current RAG evaluation dataset and publish a baseline before
   changing a provider.
2. Introduce a server-only model-provider interface; do not expose Vertex or
   OpenAI credentials to client components.
3. Deploy the existing container to Cloud Run with secrets from Secret Manager.
4. Move the queue consumer to a dedicated worker, then compare latency, cost
   and quality against the baseline.

The existing `createAgentTools(context)` boundary maps naturally to ADK-style
tools: authenticated tenant scope stays server-derived rather than model input.
