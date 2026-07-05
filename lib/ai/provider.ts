/**
 * Factoría de modelo de chat/generación. ÚNICO punto del código que conoce el
 * SDK de proveedor concreto (`@ai-sdk/openai` / `@ai-sdk/google`). El resto del
 * sistema pide un modelo con `getChatModel()` y no sabe qué proveedor hay detrás.
 *
 * Conmutación por `AI_CONFIG.provider` (env `AI_PROVIDER`):
 * - 'openai' (default): OpenAI vía `@ai-sdk/openai`.
 * - 'google':           Gemini vía Google AI Studio (`@ai-sdk/google`,
 *                        env `GOOGLE_GENERATIVE_AI_API_KEY`).
 *
 * Los embeddings NO pasan por aquí: siguen en OpenAI (lib/ai/embeddings.ts).
 *
 * MIGRAR A VERTEX AI = cambiar el import de `@ai-sdk/google` por
 * `@ai-sdk/google-vertex` y su factoría `vertex(...)` SOLO en este archivo.
 * Ningún otro módulo referencia el SDK de proveedor. Ver docs/adr/0001.
 */

import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { AI_CONFIG } from './config';

/**
 * Devuelve el modelo de chat del proveedor activo.
 *
 * @param modelId Override opcional del id de modelo (lo usa el reranker `llm`
 *   con `RERANK_LLM_MODEL`). Si es `undefined`, usa el modelo default del
 *   proveedor activo (`chatModel` para OpenAI, `googleChatModel` para Google).
 */
export function getChatModel(modelId?: string): LanguageModel {
  if (AI_CONFIG.provider === 'google') {
    return google(modelId ?? AI_CONFIG.googleChatModel);
  }
  return openai(modelId ?? AI_CONFIG.chatModel);
}
