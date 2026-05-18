/**
 * Configuración central de IA. Cualquier modelo, threshold o límite
 * configurable vive aquí. NO hardcodear estos valores en otros sitios.
 */

export const AI_CONFIG = {
  chatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  embeddingDimensions: 1536, // text-embedding-3-small produce vectores de 1536

  rag: {
    chunkSizeTokens: 700,
    chunkOverlapTokens: 100,
    matchThreshold: 0.5,
    matchCount: 8,
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
