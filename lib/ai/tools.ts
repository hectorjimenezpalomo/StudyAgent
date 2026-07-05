import { generateObject, generateText, tool } from 'ai';
import { z } from 'zod';
import {
  buildExplainPrompt,
  buildFlashcardsPrompt,
  buildQuizPrompt,
  buildSummaryPrompt,
} from './prompts';
import { AI_CONFIG } from './config';
import { getChatModel } from './provider';
import { retrieve, type RetrievalSupabase } from './retrieval';
import type { ChunkResult, Flashcard, QuizQuestion } from '@/types';
import type { Tables } from '@/lib/supabase/types';

type ChunkRow = Pick<
  Tables<'chunks'>,
  'id' | 'document_id' | 'content' | 'chunk_index' | 'page_number'
>;
type DbError = { message: string };
type QueryResult<T> = { data: T | null; error: DbError | null };
type ChunkOrderQuery = {
  order(
    column: 'chunk_index',
    options: { ascending: boolean }
  ): PromiseLike<QueryResult<ChunkRow[]>>;
};
type ChunkPageFilterQuery = {
  eq(column: 'page_number', value: number): ChunkOrderQuery;
};
type ChunkSelectQuery = {
  eq(column: 'document_id', value: string): ChunkOrderQuery;
  in(column: 'document_id', values: string[]): ChunkPageFilterQuery;
};

export type AgentToolContext = {
  userId: string;
  allowedDocumentIds: string[];
  allowedDocuments: Array<Pick<Tables<'documents'>, 'id' | 'title'>>;
  supabase: RetrievalSupabase & {
    from(table: 'chunks'): {
      select(columns: string): ChunkSelectQuery;
    };
  };
};

export type SourceCitation = {
  chunk_id?: string;
  document_id: string;
  document_title: string;
  page_number: number | null;
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

const LEXICAL_STOP_WORDS = new Set([
  'a',
  'al',
  'about',
  'and',
  'de',
  'del',
  'el',
  'en',
  'es',
  'la',
  'las',
  'lo',
  'los',
  'me',
  'of',
  'pdf',
  'que',
  'sabe',
  'sabes',
  'sobre',
  'the',
  'un',
  'una',
  'y',
]);

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

function sourceForChunk(context: AgentToolContext, chunk: ChunkResult): SourceCitation {
  const document = context.allowedDocuments.find((item) => item.id === chunk.document_id);
  return {
    chunk_id: chunk.id,
    document_id: chunk.document_id,
    document_title: document?.title ?? 'Documento privado',
    page_number: chunk.page_number,
  };
}

function documentSource(context: AgentToolContext, documentId: string): SourceCitation {
  const document = context.allowedDocuments.find((item) => item.id === documentId);
  return {
    document_id: documentId,
    document_title: document?.title ?? 'Documento privado',
    page_number: null,
  };
}

function sourcesForChunks(context: AgentToolContext, chunks: ChunkResult[]) {
  return chunks.map((chunk) => sourceForChunk(context, chunk));
}

function extractRequestedPage(query: string) {
  const match = query.match(
    /\b(?:p[aá]g(?:ina)?|page|pg\.?|p\.)\s*(?:n[úu]m(?:ero)?\.?\s*)?(\d{1,4})\b/i
  );
  if (!match) return null;

  const page = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(page) && page > 0 ? page : null;
}

function normalizeForLexicalSearch(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildLexicalTerms(query: string) {
  const terms = new Set<string>();
  const tokens = normalizeForLexicalSearch(query)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !LEXICAL_STOP_WORDS.has(token));

  for (const token of tokens) {
    terms.add(token);
  }

  return [...terms];
}

function scoreLexicalText(text: string, terms: string[]) {
  const normalized = ` ${normalizeForLexicalSearch(text)} `;
  let score = 0;

  for (const term of terms) {
    if (normalized.includes(` ${term} `)) {
      score += 2;
    } else if (normalized.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function pageRowsToChunks(rows: ChunkRow[], topK: number): ChunkResult[] {
  return rows.slice(0, topK).map((row) => ({
    id: row.id,
    document_id: row.document_id,
    content: row.content,
    chunk_index: row.chunk_index,
    page_number: row.page_number,
    similarity: 1,
  }));
}

async function loadChunksByPage(
  context: AgentToolContext,
  documentIds: string[],
  pageNumber: number,
  topK: number
) {
  const { data, error } = await context.supabase
    .from('chunks')
    .select('id, document_id, content, chunk_index, page_number')
    .in('document_id', documentIds)
    .eq('page_number', pageNumber)
    .order('chunk_index', { ascending: true });

  if (error) {
    console.error('[ai/tools] load page chunks', error);
    return {
      chunks: [] as ChunkResult[],
      message: 'No se pudo cargar la pagina solicitada.',
    };
  }

  return {
    chunks: pageRowsToChunks(data ?? [], topK),
    message:
      data && data.length > 0
        ? undefined
        : `No encontre contenido indexado para la pagina ${pageNumber}.`,
  };
}

async function retrieveLexicalFallback(
  context: AgentToolContext,
  documentIds: string[],
  query: string,
  topK: number
) {
  const terms = buildLexicalTerms(query);
  if (terms.length === 0) return [];

  const scoredChunks: Array<{ chunk: ChunkResult; score: number }> = [];

  for (const documentId of documentIds) {
    const document = context.allowedDocuments.find((item) => item.id === documentId);
    const documentTitleScore = scoreLexicalText(document?.title ?? '', terms);
    const { chunks, error } = await loadDocumentText(context, documentId);

    if (error) continue;

    for (const row of chunks) {
      const score =
        scoreLexicalText(row.content, terms) +
        (documentTitleScore > 0 && row.chunk_index < 3 ? 1 : 0);

      if (score > 0) {
        scoredChunks.push({
          chunk: {
            id: row.id,
            document_id: row.document_id,
            content: row.content,
            chunk_index: row.chunk_index,
            page_number: row.page_number,
            similarity: Math.min(0.99, score / Math.max(terms.length * 2, 1)),
          },
          score,
        });
      }
    }
  }

  return scoredChunks
    .sort((a, b) => b.score - a.score || a.chunk.chunk_index - b.chunk.chunk_index)
    .slice(0, topK)
    .map((item) => item.chunk);
}

function chunksToContext(context: AgentToolContext, chunks: ChunkResult[]) {
  return chunks
    .map((chunk, index) => {
      const source = sourceForChunk(context, chunk);
      const page = source.page_number ? `, pagina ${source.page_number}` : '';
      return `[Fuente ${index + 1}: ${source.document_title}${page}]\n${chunk.content}`;
    })
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
      sources: [] as SourceCitation[],
      message: 'No hay documentos listos dentro del filtro solicitado.',
    };
  }

  try {
    const topK = params.top_k ?? AI_CONFIG.rag.matchCount;
    const requestedPage = extractRequestedPage(params.query);

    if (requestedPage !== null) {
      const { chunks, message } = await loadChunksByPage(
        context,
        documentIds,
        requestedPage,
        topK
      );

      return {
        chunks,
        sources: sourcesForChunks(context, chunks),
        ...(message ? { message } : {}),
      };
    }

    const chunks = await retrieve(context.supabase, {
      query: params.query,
      userId: context.userId,
      documentIds,
      topK,
    });
    if (chunks.length > 0) {
      return { chunks, sources: sourcesForChunks(context, chunks) };
    }

    const fallbackChunks = await retrieveLexicalFallback(
      context,
      documentIds,
      params.query,
      topK
    );

    return {
      chunks: fallbackChunks,
      sources: sourcesForChunks(context, fallbackChunks),
      ...(fallbackChunks.length > 0
        ? { message: 'Resultados encontrados con busqueda lexica de respaldo.' }
        : {}),
    };
  } catch (err) {
    console.error('[ai/tools] search_documents', err);
    return {
      chunks: [] as ChunkResult[],
      sources: [] as SourceCitation[],
      message: 'No se pudo buscar en los documentos.',
    };
  }
}

async function loadDocumentText(context: AgentToolContext, documentId: string) {
  if (!context.allowedDocumentIds.includes(documentId)) {
    return {
      text: '',
      chunks: [] as ChunkRow[],
      error: 'Documento no disponible o aun no esta listo.',
    };
  }

  const { data, error } = await context.supabase
    .from('chunks')
    .select('id, document_id, content, chunk_index, page_number')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true });

  if (error) {
    console.error('[ai/tools] load document chunks', error);
    return {
      text: '',
      chunks: [] as ChunkRow[],
      error: 'No se pudo cargar el documento.',
    };
  }

  const chunks = data ?? [];
  return {
    text: chunks.map((chunk) => chunk.content).join('\n\n'),
    chunks,
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
      const { chunks, sources, message } = await searchDocuments(context, {
        query: topic,
        document_ids,
        top_k: AI_CONFIG.rag.matchCount,
      });

      if (chunks.length === 0) {
        return {
          questions: [] as QuizQuestion[],
          sources,
          message: message ?? 'Sin contexto suficiente.',
        };
      }

      const { object } = await generateObject({
        model: getChatModel(),
        schema: z.object({
          questions: z.array(quizQuestionSchema).max(num_questions),
        }),
        prompt: buildQuizPrompt(topic, num_questions, chunksToContext(context, chunks)),
      });

      return { ...object, sources };
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
        return { summary: '', sources: [] as SourceCitation[], message: error };
      }

      const { text: summary } = await generateText({
        model: getChatModel(),
        prompt: buildSummaryPrompt(text, length),
        maxTokens: AI_CONFIG.agent.maxTokensPerResponse,
      });

      return { summary, sources: [documentSource(context, document_id)] };
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
      const { chunks, sources, message } = await searchDocuments(context, {
        query: topic,
        document_ids,
        top_k: AI_CONFIG.rag.matchCount,
      });

      if (chunks.length === 0) {
        return {
          cards: [] as Flashcard[],
          sources,
          message: message ?? 'Sin contexto suficiente.',
        };
      }

      const { object } = await generateObject({
        model: getChatModel(),
        schema: z.object({
          cards: z.array(flashcardSchema).max(num_cards),
        }),
        prompt: buildFlashcardsPrompt(topic, num_cards, chunksToContext(context, chunks)),
      });

      return { ...object, sources };
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
      const { chunks, sources, message } = await searchDocuments(context, {
        query: concept,
        document_ids,
        top_k: AI_CONFIG.rag.matchCount,
      });

      if (chunks.length === 0) {
        return {
          explanation: '',
          sources,
          message: message ?? 'Sin contexto suficiente.',
        };
      }

      const { text } = await generateText({
        model: getChatModel(),
        prompt: buildExplainPrompt(concept, level, chunksToContext(context, chunks)),
        maxTokens: AI_CONFIG.agent.maxTokensPerResponse,
      });

      return { explanation: text, sources };
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
  buildLexicalTerms,
  chunksToContext,
  extractRequestedPage,
  filterDocumentIds,
  loadChunksByPage,
  retrieveLexicalFallback,
  searchDocuments,
  sourcesForChunks,
};
