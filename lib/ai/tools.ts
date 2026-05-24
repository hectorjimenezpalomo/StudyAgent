import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, tool } from 'ai';
import { z } from 'zod';
import {
  buildExplainPrompt,
  buildFlashcardsPrompt,
  buildQuizPrompt,
  buildSummaryPrompt,
} from './prompts';
import { AI_CONFIG } from './config';
import { retrieve, type RetrievalSupabase } from './retrieval';
import type { ChunkResult, Flashcard, QuizQuestion } from '@/types';
import type { Tables } from '@/lib/supabase/types';

type ChunkRow = Pick<Tables<'chunks'>, 'content' | 'chunk_index' | 'page_number'>;
type DbError = { message: string };
type QueryResult<T> = { data: T | null; error: DbError | null };

export type AgentToolContext = {
  userId: string;
  allowedDocumentIds: string[];
  supabase: RetrievalSupabase & {
    from(table: 'chunks'): {
      select(columns: string): {
        eq(column: string, value: string): {
          order(
            column: string,
            options: { ascending: boolean }
          ): PromiseLike<QueryResult<ChunkRow[]>>;
        };
      };
    };
  };
};

const quizQuestionSchema: z.ZodType<QuizQuestion> = z.object({
  question: z.string().min(1),
  options: z.tuple([
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
  ]),
  correct_index: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  explanation: z.string().min(1),
});

const flashcardSchema: z.ZodType<Flashcard> = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const searchDocumentsSchema = z.object({
  query: z.string().min(1).describe('La pregunta o tema a buscar, en lenguaje natural.'),
  document_ids: z
    .array(z.string().uuid())
    .optional()
    .describe('Opcional: limita la busqueda a documentos concretos.'),
  top_k: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Cuantos resultados devolver. Default: 8.'),
});

const generateQuizSchema = z.object({
  topic: z.string().min(1).describe('Tema sobre el que generar preguntas.'),
  num_questions: z
    .number()
    .int()
    .min(1)
    .max(AI_CONFIG.limits.maxQuizQuestions)
    .describe(`Numero de preguntas (1-${AI_CONFIG.limits.maxQuizQuestions}).`),
  document_ids: z.array(z.string().uuid()).optional(),
});

const generateSummarySchema = z.object({
  document_id: z.string().uuid(),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
});

const generateFlashcardsSchema = z.object({
  topic: z.string().min(1),
  num_cards: z.number().int().min(1).max(AI_CONFIG.limits.maxFlashcards),
  document_ids: z.array(z.string().uuid()).optional(),
});

const explainConceptSchema = z.object({
  concept: z.string().min(1),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
  document_ids: z.array(z.string().uuid()).optional(),
});

function filterDocumentIds(
  requestedDocumentIds: string[] | undefined,
  allowedDocumentIds: string[]
) {
  if (!requestedDocumentIds || requestedDocumentIds.length === 0) {
    return allowedDocumentIds;
  }

  const allowed = new Set(allowedDocumentIds);
  return requestedDocumentIds.filter((documentId) => allowed.has(documentId));
}

function chunksToContext(chunks: ChunkResult[]) {
  return chunks
    .map(
      (chunk, index) =>
        `[Fuente ${index + 1}${chunk.page_number ? `, pagina ${chunk.page_number}` : ''}]\n${chunk.content}`
    )
    .join('\n\n---\n\n');
}

async function searchDocuments(
  context: AgentToolContext,
  params: z.infer<typeof searchDocumentsSchema>
) {
  const documentIds = filterDocumentIds(params.document_ids, context.allowedDocumentIds);

  if (documentIds.length === 0) {
    return {
      chunks: [] as ChunkResult[],
      message: 'No hay documentos listos dentro del filtro solicitado.',
    };
  }

  try {
    const chunks = await retrieve(context.supabase, {
      query: params.query,
      userId: context.userId,
      documentIds,
      topK: params.top_k ?? AI_CONFIG.rag.matchCount,
    });
    return { chunks };
  } catch (err) {
    console.error('[ai/tools] search_documents', err);
    return {
      chunks: [] as ChunkResult[],
      message: 'No se pudo buscar en los documentos.',
    };
  }
}

async function loadDocumentText(context: AgentToolContext, documentId: string) {
  if (!context.allowedDocumentIds.includes(documentId)) {
    return {
      text: '',
      error: 'Documento no disponible o aun no esta listo.',
    };
  }

  const { data, error } = await context.supabase
    .from('chunks')
    .select('content, chunk_index, page_number')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true });

  if (error) {
    console.error('[ai/tools] load document chunks', error);
    return {
      text: '',
      error: 'No se pudo cargar el documento.',
    };
  }

  const chunks = data ?? [];
  return {
    text: chunks.map((chunk) => chunk.content).join('\n\n'),
    error: chunks.length === 0 ? 'El documento no tiene chunks listos.' : null,
  };
}

/**
 * Crea herramientas del agente limitadas al usuario y documentos permitidos.
 */
export function createAgentTools(context: AgentToolContext) {
  /**
   * Usa esta herramienta para recuperar pasajes concretos de los PDFs listos antes de responder
   * preguntas sobre el material del usuario.
   */
  const searchDocumentsTool = tool({
    description:
      'Busca pasajes relevantes en los documentos personales del usuario. Usala antes de responder a cualquier pregunta sobre el contenido de sus apuntes.',
    parameters: searchDocumentsSchema,
    execute: async (params) => searchDocuments(context, params),
  });

  /**
   * Usa esta herramienta cuando el usuario pida practicar con preguntas tipo test sobre sus documentos.
   */
  const generateQuizTool = tool({
    description:
      'Genera preguntas tipo test sobre un tema, usando los documentos del usuario como fuente. Usala cuando pidan practicar o autoevaluarse.',
    parameters: generateQuizSchema,
    execute: async ({ topic, num_questions, document_ids }) => {
      const { chunks, message } = await searchDocuments(context, {
        query: topic,
        document_ids,
        top_k: AI_CONFIG.rag.matchCount,
      });

      if (chunks.length === 0) {
        return { questions: [] as QuizQuestion[], message: message ?? 'Sin contexto suficiente.' };
      }

      const { object } = await generateObject({
        model: openai(AI_CONFIG.chatModel),
        schema: z.object({
          questions: z.array(quizQuestionSchema).max(num_questions),
        }),
        prompt: buildQuizPrompt(topic, num_questions, chunksToContext(chunks)),
      });

      return object;
    },
  });

  /**
   * Usa esta herramienta cuando el usuario pida un resumen de un documento listo concreto.
   */
  const generateSummaryTool = tool({
    description: 'Resume un documento completo.',
    parameters: generateSummarySchema,
    execute: async ({ document_id, length }) => {
      const { text, error } = await loadDocumentText(context, document_id);
      if (error) {
        return { summary: '', message: error };
      }

      const { text: summary } = await generateText({
        model: openai(AI_CONFIG.chatModel),
        prompt: buildSummaryPrompt(text, length),
        maxTokens: AI_CONFIG.agent.maxTokensPerResponse,
      });

      return { summary };
    },
  });

  /**
   * Usa esta herramienta cuando el usuario pida tarjetas de repaso o flashcards sobre un tema.
   */
  const generateFlashcardsTool = tool({
    description:
      'Genera flashcards pregunta/respuesta cortas sobre un tema para repaso espaciado.',
    parameters: generateFlashcardsSchema,
    execute: async ({ topic, num_cards, document_ids }) => {
      const { chunks, message } = await searchDocuments(context, {
        query: topic,
        document_ids,
        top_k: AI_CONFIG.rag.matchCount,
      });

      if (chunks.length === 0) {
        return { cards: [] as Flashcard[], message: message ?? 'Sin contexto suficiente.' };
      }

      const { object } = await generateObject({
        model: openai(AI_CONFIG.chatModel),
        schema: z.object({
          cards: z.array(flashcardSchema).max(num_cards),
        }),
        prompt: buildFlashcardsPrompt(topic, num_cards, chunksToContext(chunks)),
      });

      return object;
    },
  });

  /**
   * Usa esta herramienta cuando el usuario pida una explicacion adaptada a un nivel de detalle.
   */
  const explainConceptTool = tool({
    description:
      'Explica un concepto adaptando la profundidad al nivel pedido, usando los documentos como fuente principal.',
    parameters: explainConceptSchema,
    execute: async ({ concept, level, document_ids }) => {
      const { chunks, message } = await searchDocuments(context, {
        query: concept,
        document_ids,
        top_k: AI_CONFIG.rag.matchCount,
      });

      if (chunks.length === 0) {
        return { explanation: '', message: message ?? 'Sin contexto suficiente.' };
      }

      const { text } = await generateText({
        model: openai(AI_CONFIG.chatModel),
        prompt: buildExplainPrompt(concept, level, chunksToContext(chunks)),
        maxTokens: AI_CONFIG.agent.maxTokensPerResponse,
      });

      return { explanation: text };
    },
  });

  return {
    search_documents: searchDocumentsTool,
    generate_quiz: generateQuizTool,
    generate_summary: generateSummaryTool,
    generate_flashcards: generateFlashcardsTool,
    explain_concept: explainConceptTool,
  };
}

export const __toolsTestUtils = {
  chunksToContext,
  filterDocumentIds,
  searchDocuments,
};
