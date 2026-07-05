/**
 * LLM-as-judge para métricas de generación.
 *
 * Usa el mismo modelo configurado en `lib/ai/config.ts` (gpt-4o-mini por
 * defecto). No es la última palabra: cualquier juez basado en LLM tiene
 * varianza y bias. Reportar varianza entre runs en futuros experimentos.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { getChatModel } from '../lib/ai/provider';

const judgmentSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe('Puntuación entre 0 y 1. 0 = totalmente mal, 1 = perfecto.'),
  reasoning: z
    .string()
    .min(1)
    .describe('Justificación breve (1-3 frases) sobre por qué se otorga esa puntuación.'),
});

export interface JudgeResult {
  score: number;
  reasoning: string;
}

/**
 * Faithfulness: mide si la respuesta está sostenida por el contexto recuperado.
 *
 * Una respuesta puede ser correcta y aun así fallar en faithfulness si añade
 * datos que no aparecen en el contexto. Por eso esta métrica detecta
 * alucinaciones aunque la respuesta sea factualmente cierta.
 */
export async function judgeFaithfulness(
  contextText: string,
  answer: string
): Promise<JudgeResult> {
  if (!answer.trim()) {
    return { score: 0, reasoning: 'Respuesta vacía.' };
  }

  const { object } = await generateObject({
    model: getChatModel(),
    schema: judgmentSchema,
    prompt: `Evalúa si la RESPUESTA está soportada por el CONTEXTO. Devuelve un score entre 0 y 1:

- 1.0: cada afirmación de la respuesta aparece literal o parafraseada en el contexto.
- 0.5: parte de la respuesta está en el contexto, parte no.
- 0.0: la respuesta inventa datos que no están en el contexto.

Una respuesta que dice "no tengo información sobre eso" cuando el contexto efectivamente no la tiene es score 1.0.

CONTEXTO:
${contextText}

RESPUESTA:
${answer}`,
  });

  return object;
}

/**
 * Answer relevancy: mide si la respuesta aborda la pregunta del usuario.
 *
 * Independiente de si es factualmente correcta. Una respuesta correcta pero
 * que no contesta la pregunta puntúa bajo aquí.
 */
export async function judgeAnswerRelevancy(
  question: string,
  answer: string
): Promise<JudgeResult> {
  if (!answer.trim()) {
    return { score: 0, reasoning: 'Respuesta vacía.' };
  }

  const { object } = await generateObject({
    model: getChatModel(),
    schema: judgmentSchema,
    prompt: `Evalúa si la RESPUESTA aborda directamente la PREGUNTA del usuario. Devuelve un score entre 0 y 1:

- 1.0: responde con precisión a lo que se pregunta.
- 0.5: responde parcialmente o se va por las ramas.
- 0.0: no aborda la pregunta o cambia de tema.

Ignora si la respuesta es factualmente correcta; solo importa si trata el tema correcto.

PREGUNTA:
${question}

RESPUESTA:
${answer}`,
  });

  return object;
}
