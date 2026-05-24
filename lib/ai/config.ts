/**
 * Configuración central de IA. Cualquier modelo, threshold o límite
 * configurable vive aquí. NO hardcodear estos valores en otros sitios.
 */

function parseRetrievalMode(value: string | undefined): 'vector' | 'hybrid' {
  if (value === 'hybrid' || value === 'vector') return value;
  return 'vector';
}

function parseRerankProvider(value: string | undefined): RerankProvider {
  if (value === 'llm' || value === 'cohere' || value === 'none') return value;
  return 'none';
}

export const AI_CONFIG = {
  chatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
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
    // Modelo usado por el reranker LLM. Default = chatModel (gpt-4o-mini).
    rerankLlmModel: process.env.RERANK_LLM_MODEL ?? 'gpt-4o-mini',
  },

  agent: {
    maxSteps: 5, // máximo número de tool calls encadenadas
    maxTokensPerResponse: 2000,
  },

  limits: {
    maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES ?? '26214400', 10),
    maxQuizQuestions: 20,
    maxFlashcards: 30,
  },
} as const;

export type RetrievalMode = 'vector' | 'hybrid';
export type RerankProvider = 'none' | 'llm' | 'cohere';
