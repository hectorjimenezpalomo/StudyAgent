# StudyAgent

StudyAgent convierte PDFs privados en un asistente de estudio con búsqueda
grounded, tools para practicar y conversaciones persistentes. Es un proyecto de
applied AI diseñado para hacer visibles sus decisiones técnicas, no para
presentar un chatbot genérico como un producto terminado.

## Qué hace hoy

- Sube PDFs a un bucket privado por usuario y los procesa mediante una cola
  durable respaldada por Postgres.
- Extrae texto con `pdf-parse`, conserva el número de página cuando el
  extractor lo aporta, crea chunks de ~700 tokens con solape de 100 y genera
  embeddings de 1536 dimensiones.
- Recupera contexto mediante pgvector/HNSW; ofrece hybrid search BM25 + RRF y
  reranking como flags evaluables, no como defaults sin medir.
- Usa tools con schemas Zod para buscar, resumir, explicar y generar quizzes o
  flashcards; las herramientas devuelven fuentes enlazables al documento.
- Aísla documentos, chunks y conversaciones mediante Supabase Auth, RLS,
  Storage privado y un filtro de documentos permitido dentro de cada tool.
- Registra trazas sin contenido sensible y permite feedback útil/no útil sobre
  respuestas persistidas para revisar calidad en `/admin`.

```mermaid
flowchart LR
  U[Usuario autenticado] --> UP[Upload PDF]
  UP --> ST[Supabase Storage privado]
  UP --> Q[(ingestion_jobs)]
  Q --> W[Worker cron protegido]
  W --> P[pdf-parse + chunking]
  P --> E[OpenAI embeddings 1536d]
  E --> V[(Postgres + pgvector/HNSW)]

  U --> C[Chat]
  C --> A[Agente + tools]
  A --> RET[Retrieval: vector o hybrid BM25+RRF]
  RET --> V
  RET --> RR[Reranker opcional: LLM / Cohere]
  RR --> A
  A --> G["Generación (OpenAI o Gemini vía AI_PROVIDER)"]
  G --> R[Respuesta + citas]

  MCP[Servidor MCP stdio] --> A
  V -. mismo pipeline .-> EVTS[evals TS]
  V -. mismo pipeline .-> EVPY[evals-py + Ragas]
```

## Stack

- Next.js 16 App Router, React 19 y TypeScript estricto
- Supabase Auth, Postgres, Storage y pgvector
- Vercel AI SDK v4, OpenAI `gpt-4o-mini` y `text-embedding-3-small`
- Proveedor de chat conmutable OpenAI ↔ Gemini (`AI_PROVIDER=openai|google`,
  Gemini vía Google AI Studio); embeddings siempre en OpenAI
- `pdf-parse`, Zod, Vitest y Playwright

## Inicio local

Requiere Node 20+, Docker y Supabase CLI.

macOS/Linux:

```bash
npm install
cp .env.example .env.local
supabase start
supabase db reset
npm run db:types
npm run dev
```

PowerShell:

```powershell
npm install
Copy-Item .env.example .env.local
supabase start
supabase db reset
npm run db:types
npm run dev
```

Completa `.env.local` con Supabase, OpenAI, `ADMIN_EMAILS` y un `CRON_SECRET`
largo. `CHAT_REQUESTS_PER_MINUTE` limita el chat; las tarifas de tokens son
opcionales y solo alimentan la estimación de coste en `/admin`.

## Ingesta durable

El upload crea un documento `pending`, guarda el archivo y encola un job. El
worker `GET /api/internal/ingest` reclama un job de forma atómica, reintenta
fallos transitorios hasta tres veces y deja un estado terminal visible al
usuario. En Vercel, `vercel.json` lo programa cada cinco minutos y el endpoint
exige `Authorization: Bearer $CRON_SECRET`.

Para desarrollo, invoca el worker manualmente tras subir un PDF:

```powershell
Invoke-WebRequest http://localhost:3000/api/internal/ingest `
  -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

## Evaluación

El objetivo de diseño es no activar hybrid search, reranking ni otro proveedor
"porque suenan bien", sino **medir cada cambio** contra un dataset antes de
adoptarlo. Dos harnesses corren el **mismo pipeline RAG** (mismos RPC de Supabase,
mismo dataset, mismo formato de salida `RunReport`):

- **`evals/`** (TypeScript): recall@k, MRR, hit rate, faithfulness/relevancy con
  LLM-as-judge y latencia por etapa.
- **`evals-py/`** (Python + Ragas): las mismas métricas propias más `faithfulness`,
  `answer_relevancy`, `context_precision` y `context_recall` de Ragas. Correr
  ambos sobre las mismas respuestas permite una **meta-evaluación "mi juez vs
  Ragas"**. Ver [`evals-py/README.md`](evals-py/README.md).

El dataset son casos reales en `evals/dataset.jsonl` o 100+ casos sintéticos
generados por LLM (`evals-py/evals_py/synthesize.py`, donde el chunk origen es el
ground truth de retrieval).

### Barrido reproducible

La comparación es un barrido `provider × retrieval_mode × reranker`. Cada
configuración es un `npm run eval` con esos flags, que produce recall@8, MRR,
faithfulness y p95 de latencia para esa fila:

```bash
RAG_RETRIEVAL_MODE=vector RERANK_PROVIDER=none   npm run eval   # baseline
RAG_RETRIEVAL_MODE=hybrid RERANK_PROVIDER=none   npm run eval
RAG_RETRIEVAL_MODE=hybrid RERANK_PROVIDER=llm    npm run eval
RAG_RETRIEVAL_MODE=hybrid RERANK_PROVIDER=cohere npm run eval   # requiere COHERE_API_KEY
AI_PROVIDER=google RAG_RETRIEVAL_MODE=hybrid RERANK_PROVIDER=cohere npm run eval

npm run eval:compare        # delta agregado + casos que mejoran/regresan
cd evals-py && uv run python -m evals_py.runner   # mismas métricas + Ragas
```

Los números **no se versionan a propósito**: dependen de tus PDFs y de una
instancia concreta de Supabase (los `chunk_id` de ground truth pertenecen a esa
base), así que publicarlos aquí sería ruido no reproducible. El workflow manual
[`eval.yml`](.github/workflows/eval.yml) ejecuta un run contra tu Supabase y
publica su agregado en el step summary de la Action.

## Servidor MCP

Las 5 tools del agente se exponen como servidor MCP stdio (`npm run mcp`) para
usarlas desde Claude Desktop o Cursor. Detalles, seguridad y config en
[`docs/mcp.md`](docs/mcp.md).

## Límites conocidos

No hay OCR para PDFs escaneados, las citas enlazan a la lista de documentos (no a
un visor PDF con resaltado), y la cuota de chat es un fixed window sencillo, no un
control de facturación empresarial.

## Verificación

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

`npm run test:e2e` requiere credenciales reales y servicios configurados. El
workflow de CI ejecuta lint, typecheck, tests y build en cada push o PR a
`main`.

## Demo de dos minutos

1. Entra con el usuario demo y muestra un PDF ya `ready`.
2. Pregunta un hecho concreto y abre `search_documents` para enseñar fuentes.
3. Genera un quiz y flashcards; ambas salidas son estructuradas.
4. Abre una fuente y recarga el chat para mostrar procedencia y persistencia.
5. Explica que hybrid/reranking se activan solo tras medirlos contra el
   harness, y que las trazas no almacenan texto de PDFs ni respuestas.

## Despliegue

1. Aplica las migraciones en Supabase y verifica el bucket privado `documents`.
2. Configura las variables de `.env.example` en Vercel, incluido `CRON_SECRET`.
3. Despliega `main`; Vercel ejecutará el worker definido en `vercel.json`.
4. Comprueba `/login`, `/documents`, `/chat`, la ejecución cron y `/admin`.

## Documentación

- `ARCHITECTURE.md`: contratos de tablas, rutas, tools y configuración.
- `evals/README.md`: formato del dataset, dataset sintético y cómo interpretar resultados.
- `evals-py/README.md`: harness Python + Ragas y meta-evaluación del juez.
- `docs/mcp.md`: servidor MCP (setup, seguridad, config de Claude Desktop).
- `docs/adr/`: decisiones de arquitectura (proveedor multiprov., evals Python, MCP).
- `ROADMAP.md`: niveles 1-3 de mejoras de RAG y producto pendientes.
- `docs/gcp-mapping.md`: ruta de despliegue GCP sin afirmar una migración no realizada.
- `AGENTS.md`: reglas de implementación y seguridad.
