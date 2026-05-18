/**
 * Wrapper sobre la API de embeddings de OpenAI.
 * Centraliza el modelo, el batching y el manejo de errores.
 */

import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { AI_CONFIG } from './config';

const BATCH_SIZE = 100; // máximo razonable para text-embedding-3-small

/**
 * Embedea un array de textos. Procesa en lotes de BATCH_SIZE.
 * Devuelve embeddings en el mismo orden que la entrada.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: openai.embedding(AI_CONFIG.embeddingModel),
      values: batch,
    });
    results.push(...embeddings);
  }

  return results;
}

/**
 * Atajo para embebir una sola query (por ejemplo, la pregunta del usuario).
 */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embed([text]);
  return embedding;
}
