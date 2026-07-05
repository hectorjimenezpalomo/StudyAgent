/**
 * Configuración central de IA. Cualquier modelo, threshold o límite
 * configurable vive aquí. NO hardcodear estos valores en otros sitios.
 */

function parseRetrievalMode(value: string | undefined): 'vector' | 'hybrid' {
  if (value === 'hybrid' || value === 'vector') return value;
  return 'vector';
}

function parseProvider(value: string | undefined): AiProvider {
  if (value === 'google' || value === 'openai') return value;
  return 'openai';
}

function parseRerankProvider(value: string | undefined): RerankProvider {
  if (value === 'llm' || value === 'cohere' || value === 'none') return value;
  return 'none';
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeNumber(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const AI_CONFIG = {
  // Proveedor de chat/generación activo. 'openai' (default) o 'google' (Gemini
  // vía Google AI Studio). Los embeddings NO dependen de esto: siguen en OpenAI
  // (ver AGENTS.md regla 6 y docs/adr/0001). La factoría lib/ai/provider.ts es
  // el único sitio que conoce el SDK del proveedor.
  provider: parseProvider(process.env.AI_PROVIDER),
  chatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
  // Modelo de chat cuando provider='google'. Gemini 2.0 Flash es el default:
  // rápido y con free tier generoso en AI Studio.
  googleChatModel: process.env.GOOGLE_CHAT_MODEL ?? 'gemini-2.0-flash',
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  embeddingDimensions: 1536, // text-embedding-3-small produce vectores de 1536

  rag: {
    chunkSizeTokens: 700,
    chunkOverlapTokens: 100,
    matchThreshold: 0.5,
    matchCount: 8,
    // 'vector' = solo pgvector (legacy, default). 'hybrid' = pgvector + BM25
    // fusionados con RRF en `match_chunks_hybrid`. Hybrid requiere haber
    // aplicado la migración 004; mantenemos 'vector' como default para que
    // un despliegue sin la migración no rompa.
    retrievalMode: parseRetrievalMode(process.env.RAG_RETRIEVAL_MODE),
    // Constante k del Reciprocal Rank Fusion. 60 es el valor del paper
    // original (Cormack et al.) y el de la mayoría de implementaciones.
    hybridRRFConstant: 60,
    // Cuántos candidatos por ranker antes de fusionar. 4x significa que con
    // matchCount=8 cada lado aporta 32 candidatos al pool fusionado.
    hybridCandidateMultiplier: 4,
    // Reranking post-retrieval. 'none' = sin reranker (default). 'llm' =
    // gpt-4o-mini puntúa listwise. 'cohere' = Cohere Rerank v3 multilingual
    // (requiere COHERE_API_KEY).
    rerankProvider: parseRerankProvider(process.env.RERANK_PROVIDER),
    // Cuántos candidatos pedir al retrieval antes de rerankear. Con topK=8 y
    // multiplier=3 → fetch 24 → rerank → top 8.
    rerankCandidatePoolMultiplier: 3,
    // Modelo usado por el reranker LLM. Si no se define RERANK_LLM_MODEL, el
    // reranker usa el modelo default del proveedor activo (getChatModel(undefined)),
    // para que AI_PROVIDER=google no intente cargar un modelo OpenAI.
    rerankLlmModel: process.env.RERANK_LLM_MODEL,
  },

  agent: {
    maxSteps: 5, // máximo número de tool calls encadenadas
    maxTokensPerResponse: 2000,
  },

  limits: {
    maxUploadBytes: parsePositiveInteger(process.env.MAX_UPLOAD_BYTES, 26214400),
    maxQuizQuestions: 20,
    maxFlashcards: 30,
    chatRequestsPerMinute: parsePositiveInteger(
      process.env.CHAT_REQUESTS_PER_MINUTE,
      20
    ),
  },

  observability: {
    // Set current provider rates through env vars. Zero means cost is tracked
    // as unavailable instead of guessing from a stale hardcoded price.
    chatInputCostUsdPerMillion: parseNonNegativeNumber(
      process.env.CHAT_INPUT_COST_USD_PER_MILLION,
      0
    ),
    chatOutputCostUsdPerMillion: parseNonNegativeNumber(
      process.env.CHAT_OUTPUT_COST_USD_PER_MILLION,
      0
    ),
  },
} as const;

export type AiProvider = 'openai' | 'google';
export type RetrievalMode = 'vector' | 'hybrid';
export type RerankProvider = 'none' | 'llm' | 'cohere';
