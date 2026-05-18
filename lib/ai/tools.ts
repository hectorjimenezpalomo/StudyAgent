/**
 * Herramientas del agente. Cada herramienta sigue el formato del Vercel AI SDK.
 *
 * Codex: implementa cada `execute`. Los schemas zod ya están listos; NO los cambies
 * sin justificación. El system prompt en lib/ai/prompts.ts ya hace referencia
 * a estos nombres exactos.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { AI_CONFIG } from './config';

/**
 * Busca chunks relevantes en los documentos del usuario.
 * Implementación: embedea la query, llama a la RPC match_chunks en Supabase,
 * devuelve los chunks ordenados por similitud descendente.
 */
export const searchDocumentsTool = tool({
  description:
    'Busca pasajes relevantes en los documentos personales del usuario. Úsala antes de responder a cualquier pregunta sobre el contenido de sus apuntes.',
  parameters: z.object({
    query: z.string().min(1).describe('La pregunta o tema a buscar, en lenguaje natural.'),
    document_ids: z
      .array(z.string().uuid())
      .optional()
      .describe('Opcional: limita la búsqueda a documentos concretos. Si se omite, busca en todos los del usuario.'),
    top_k: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Cuántos resultados devolver. Default: 8.'),
  }),
  execute: async ({ query, document_ids, top_k }) => {
    // TODO Codex: implementar siguiendo lib/ai/embeddings.ts y la RPC match_chunks.
    // Devolver { chunks: Array<{ id, document_id, content, page_number, similarity }> }
    // Pasar siempre el user_id del contexto autenticado a la RPC.
    throw new Error('searchDocumentsTool no implementada todavía');
  },
});

export const generateQuizTool = tool({
  description:
    'Genera preguntas tipo test sobre un tema, usando los documentos del usuario como fuente. Úsala cuando pidan practicar o autoevaluarse.',
  parameters: z.object({
    topic: z.string().min(1).describe('Tema sobre el que generar preguntas.'),
    num_questions: z
      .number()
      .int()
      .min(1)
      .max(AI_CONFIG.limits.maxQuizQuestions)
      .describe(`Número de preguntas (1-${AI_CONFIG.limits.maxQuizQuestions}).`),
    document_ids: z.array(z.string().uuid()).optional(),
  }),
  execute: async ({ topic, num_questions, document_ids }) => {
    // TODO Codex: 1) RAG con searchDocuments para topic; 2) llamar LLM con buildQuizPrompt;
    // 3) parsear JSON; 4) devolver { questions: QuizQuestion[] }
    throw new Error('generateQuizTool no implementada todavía');
  },
});

export const generateSummaryTool = tool({
  description:
    'Resume un documento completo. Úsala cuando pidan "resúmeme el documento X".',
  parameters: z.object({
    document_id: z.string().uuid(),
    length: z.enum(['short', 'medium', 'long']).default('medium'),
  }),
  execute: async ({ document_id, length }) => {
    // TODO Codex: 1) traer TODOS los chunks del documento ordenados por chunk_index;
    // 2) concatenar contenido; 3) llamar LLM con buildSummaryPrompt;
    // 4) devolver { summary: string }
    throw new Error('generateSummaryTool no implementada todavía');
  },
});

export const generateFlashcardsTool = tool({
  description:
    'Genera flashcards (pregunta/respuesta cortas) sobre un tema para repaso espaciado.',
  parameters: z.object({
    topic: z.string().min(1),
    num_cards: z.number().int().min(1).max(AI_CONFIG.limits.maxFlashcards),
    document_ids: z.array(z.string().uuid()).optional(),
  }),
  execute: async ({ topic, num_cards, document_ids }) => {
    // TODO Codex: idéntico patrón a generateQuiz pero con buildFlashcardsPrompt.
    throw new Error('generateFlashcardsTool no implementada todavía');
  },
});

export const explainConceptTool = tool({
  description:
    'Explica un concepto adaptando la profundidad al nivel pedido. Úsala cuando el usuario pida una explicación detallada.',
  parameters: z.object({
    concept: z.string().min(1),
    level: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
    document_ids: z.array(z.string().uuid()).optional(),
  }),
  execute: async ({ concept, level, document_ids }) => {
    // TODO Codex: RAG + buildExplainPrompt + LLM call. Devolver { explanation: string }.
    throw new Error('explainConceptTool no implementada todavía');
  },
});

/**
 * El conjunto completo que se pasa a streamText en /api/chat.
 */
export const agentTools = {
  search_documents: searchDocumentsTool,
  generate_quiz: generateQuizTool,
  generate_summary: generateSummaryTool,
  generate_flashcards: generateFlashcardsTool,
  explain_concept: explainConceptTool,
};
