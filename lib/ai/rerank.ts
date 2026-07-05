/**
 * Capa de reranking post-retrieval.
 *
 * El retrieval (vector o hybrid) optimiza recall: trae muchos candidatos
 * potencialmente relevantes. El reranker optimiza precisión: reordena esos
 * candidatos con una señal más cara pero más fiel a la query.
 *
 * Dos implementaciones:
 * - `llm`: gpt-4o-mini puntúa cada candidato 0-10 listwise (un solo prompt
 *   con todos los candidatos). Mitigamos position bias con shuffle previo.
 *   Funciona out-of-the-box con OPENAI_API_KEY. Más caro por query.
 * - `cohere`: Cohere Rerank v3 multilingual via HTTP (sin SDK). Cross-encoder
 *   real, mejor calidad típica que LLM-as-reranker. Requiere COHERE_API_KEY.
 *
 * Sin proveedor nuevo se hace por aquí. Si fallan en runtime, retrieval cae
 * back al orden original truncado a topK.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { AI_CONFIG, type RerankProvider } from './config';
import { getChatModel } from './provider';
import { buildRerankPrompt } from './prompts';

export interface RerankInput {
  query: string;
  documents: { id: string; content: string }[];
  topK: number;
}

export interface RerankedDocument {
  id: string;
  rerank_score: number;
}

export interface Reranker {
  rerank(input: RerankInput): Promise<RerankedDocument[]>;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const llmRerankSchema = z.object({
  scores: z
    .array(
      z.object({
        index: z.number().int().min(1),
        score: z.number().min(0).max(10),
      })
    )
    .min(1),
});

export function createLlmReranker(
  model: string | undefined = AI_CONFIG.rag.rerankLlmModel
): Reranker {
  return {
    async rerank(input) {
      if (input.documents.length === 0) return [];

      const shuffled = shuffle(input.documents);
      const { object } = await generateObject({
        // Sin RERANK_LLM_MODEL, getChatModel(undefined) usa el default del
        // proveedor activo (evita cargar un modelo OpenAI bajo AI_PROVIDER=google).
        model: getChatModel(model),
        schema: llmRerankSchema,
        prompt: buildRerankPrompt(
          input.query,
          shuffled.map((d) => d.content)
        ),
      });

      return object.scores
        .filter((s) => s.index >= 1 && s.index <= shuffled.length)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.topK)
        .map((s) => ({
          id: shuffled[s.index - 1].id,
          rerank_score: s.score,
        }));
    },
  };
}

const cohereResponseSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      relevance_score: z.number(),
    })
  ),
});

export interface CohereRerankerOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
}

export function createCohereReranker(opts: CohereRerankerOptions): Reranker {
  const model = opts.model ?? 'rerank-multilingual-v3.0';
  const endpoint = opts.endpoint ?? 'https://api.cohere.com/v2/rerank';
  return {
    async rerank(input) {
      if (input.documents.length === 0) return [];

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          query: input.query,
          documents: input.documents.map((d) => d.content),
          top_n: input.topK,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`[ai/rerank] Cohere ${response.status}: ${body.slice(0, 200)}`);
      }

      const raw: unknown = await response.json();
      const parsed = cohereResponseSchema.parse(raw);

      return parsed.results
        .filter((r) => r.index < input.documents.length)
        .map((r) => ({
          id: input.documents[r.index].id,
          rerank_score: r.relevance_score,
        }));
    },
  };
}

export function createReranker(provider: Exclude<RerankProvider, 'none'>): Reranker {
  if (provider === 'cohere') {
    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) {
      throw new Error('[ai/rerank] RERANK_PROVIDER=cohere requiere COHERE_API_KEY');
    }
    return createCohereReranker({
      apiKey,
      model: process.env.COHERE_RERANK_MODEL,
    });
  }
  if (provider === 'llm') {
    return createLlmReranker();
  }
  const _exhaustive: never = provider;
  throw new Error(`[ai/rerank] Provider desconocido: ${String(_exhaustive)}`);
}
