import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { AI_CONFIG } from './config';

export const EMBEDDING_BATCH_SIZE = 100;

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: openai.embedding(AI_CONFIG.embeddingModel),
      values: batch,
    });
    results.push(...embeddings);
  }

  return results;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embed([text]);
  return embedding;
}
