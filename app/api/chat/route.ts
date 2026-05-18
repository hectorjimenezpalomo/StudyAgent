/**
 * POST /api/chat — endpoint principal del agente.
 *
 * En Fase 3 (RAG manual): recibe messages, hace RAG con el último mensaje,
 * pasa el contexto al LLM y streamea respuesta.
 *
 * En Fase 4 (agente): usa streamText con el set de tools de lib/ai/tools.ts.
 * El modelo decide qué herramientas usar y en qué orden.
 *
 * Codex: implementa la versión de Fase 4 directamente si es viable.
 */

import { openai } from '@ai-sdk/openai';
import { streamText, type UIMessage, convertToModelMessages } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { agentTools } from '@/lib/ai/tools';
import { SYSTEM_PROMPT_AGENT } from '@/lib/ai/prompts';
import { AI_CONFIG } from '@/lib/ai/config';

export const maxDuration = 60;

const bodySchema = z.object({
  messages: z.array(z.any()),
  document_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(req: Request) {
  // Validar autenticación
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  // Validar body
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Body inválido', details: parsed.error.flatten() }, { status: 400 });
  }

  const { messages /* , document_ids */ } = parsed.data;

  // TODO Codex: pasar el user_id y document_ids al contexto de las tools.
  // Una opción: wrappear las tools con un closure que tenga acceso a estas vars.
  // Otra: poner user_id en un AsyncLocalStorage y leerlo desde dentro de cada tool.execute.

  console.log(`[api/chat] user=${user.id} messages=${messages.length}`);

  const result = streamText({
    model: openai(AI_CONFIG.chatModel),
    system: SYSTEM_PROMPT_AGENT,
    messages: convertToModelMessages(messages as UIMessage[]),
    tools: agentTools,
    maxSteps: AI_CONFIG.agent.maxSteps,
    maxTokens: AI_CONFIG.agent.maxTokensPerResponse,
  });

  return result.toUIMessageStreamResponse();
}
