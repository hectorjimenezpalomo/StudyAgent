import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateObject, generateText } from 'ai';
import { embedQuery } from '../embeddings';
import { createAgentTools, __toolsTestUtils, type AgentToolContext } from '../tools';
import type { ChunkResult } from '@/types';

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn((model: string) => ({ model })),
}));

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  tool: vi.fn((definition: unknown) => definition),
}));

vi.mock('../embeddings', () => ({
  embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
}));

const USER_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_DOCUMENT_ID = '44444444-4444-4444-8444-444444444444';
const EXPECTED_SOURCES = [
  {
    chunk_id: '55555555-5555-4555-8555-555555555555',
    document_id: DOCUMENT_ID,
    document_title: 'Apuntes de prueba.pdf',
    page_number: null,
  },
];

function runTool<TArgs>(execute: unknown, args: TArgs) {
  return (execute as (args: TArgs, options: unknown) => Promise<unknown>)(args, {});
}

function createContext(options: {
  allowedDocumentIds?: string[];
  chunks?: ChunkResult[];
  documentChunks?: Array<{
    id: string;
    document_id: string;
    content: string;
    chunk_index: number;
    page_number: number | null;
  }>;
  rpcError?: { message: string } | null;
  chunksError?: { message: string } | null;
} = {}) {
  const rpc = vi.fn(async () => ({
    data: options.chunks ?? [
      {
        id: '55555555-5555-4555-8555-555555555555',
        document_id: DOCUMENT_ID,
        content: 'Contenido relevante',
        chunk_index: 0,
        page_number: null,
        similarity: 0.82,
      },
    ],
    error: options.rpcError ?? null,
  }));

  const order = vi.fn(async () => ({
    data: options.documentChunks ?? [
      {
        id: '55555555-5555-4555-8555-555555555555',
        document_id: DOCUMENT_ID,
        content: 'Primera parte',
        chunk_index: 0,
        page_number: null,
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        document_id: DOCUMENT_ID,
        content: 'Segunda parte',
        chunk_index: 1,
        page_number: null,
      },
    ],
    error: options.chunksError ?? null,
  }));

  const documentEq = vi.fn(() => ({ order }));
  const pageEq = vi.fn(() => ({ order }));
  const inFilter = vi.fn(() => ({ eq: pageEq }));
  const select = vi.fn(() => ({ eq: documentEq, in: inFilter }));
  const from = vi.fn(() => ({ select }));

  const context: AgentToolContext = {
    userId: USER_ID,
    allowedDocumentIds: options.allowedDocumentIds ?? [DOCUMENT_ID],
    allowedDocuments: [
      {
        id: DOCUMENT_ID,
        title: 'Apuntes de prueba.pdf',
      },
    ],
    supabase: {
      rpc,
      from,
    },
  };

  return { context, rpc, from, select, documentEq, inFilter, pageEq, order };
}

describe('agent tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        questions: [
          {
            question: 'Pregunta',
            options: ['A', 'B', 'C', 'D'],
            correct_index: 0,
            explanation: 'Porque si.',
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);
    vi.mocked(generateText).mockResolvedValue({
      text: 'Texto generado',
    } as Awaited<ReturnType<typeof generateText>>);
  });

  it('filtra documentos solicitados contra los permitidos', () => {
    expect(
      __toolsTestUtils.filterDocumentIds(
        [DOCUMENT_ID, OTHER_DOCUMENT_ID],
        [DOCUMENT_ID]
      )
    ).toEqual([DOCUMENT_ID]);
  });

  it('search_documents embedea la query y llama match_chunks con documentos permitidos', async () => {
    const { context, rpc } = createContext({ allowedDocumentIds: [DOCUMENT_ID] });

    const result = await __toolsTestUtils.searchDocuments(context, {
      query: 'tema',
      document_ids: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
      top_k: 3,
    });

    expect(embedQuery).toHaveBeenCalledWith('tema');
    expect(rpc).toHaveBeenCalledWith('match_chunks', {
      query_embedding: '[0.1,0.2,0.3]',
      match_threshold: 0.5,
      match_count: 3,
      p_user_id: USER_ID,
      p_document_ids: [DOCUMENT_ID],
    });
    expect(result.chunks).toHaveLength(1);
  });

  it('search_documents no llama OpenAI si el filtro deja cero documentos', async () => {
    const { context, rpc } = createContext({ allowedDocumentIds: [DOCUMENT_ID] });

    const result = await __toolsTestUtils.searchDocuments(context, {
      query: 'tema',
      document_ids: [OTHER_DOCUMENT_ID],
    });

    expect(embedQuery).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({
      chunks: [],
      sources: [],
      message: 'No hay documentos listos dentro del filtro solicitado.',
    });
  });

  it('search_documents carga chunks por pagina explicita sin embedding', async () => {
    const { context, rpc, from, inFilter, pageEq, order } = createContext({
      documentChunks: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          document_id: DOCUMENT_ID,
          content: 'Contenido de la pagina siete',
          chunk_index: 6,
          page_number: 7,
        },
      ],
    });

    const result = await __toolsTestUtils.searchDocuments(context, {
      query: 'de que va la pagina 7 del pdf',
      top_k: 1,
    });

    expect(embedQuery).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith('chunks');
    expect(inFilter).toHaveBeenCalledWith('document_id', [DOCUMENT_ID]);
    expect(pageEq).toHaveBeenCalledWith('page_number', 7);
    expect(order).toHaveBeenCalledWith('chunk_index', { ascending: true });
    expect(result).toEqual({
      chunks: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          document_id: DOCUMENT_ID,
          content: 'Contenido de la pagina siete',
          chunk_index: 6,
          page_number: 7,
          similarity: 1,
        },
      ],
      sources: [
        {
          chunk_id: '77777777-7777-4777-8777-777777777777',
          document_id: DOCUMENT_ID,
          document_title: 'Apuntes de prueba.pdf',
          page_number: 7,
        },
      ],
    });
  });

  it('search_documents usa fallback lexico bilingue si vector no recupera chunks', async () => {
    const { context, rpc, documentEq } = createContext({
      chunks: [],
      documentChunks: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          document_id: DOCUMENT_ID,
          content: 'Principles of Computer Design and quantitative analysis',
          chunk_index: 24,
          page_number: 25,
        },
      ],
    });

    const result = await __toolsTestUtils.searchDocuments(context, {
      query: 'que sabes sobre diseño',
      top_k: 3,
    });

    expect(embedQuery).toHaveBeenCalledWith('que sabes sobre diseño');
    expect(rpc).toHaveBeenCalledWith('match_chunks', {
      query_embedding: '[0.1,0.2,0.3]',
      match_threshold: 0.5,
      match_count: 3,
      p_user_id: USER_ID,
      p_document_ids: [DOCUMENT_ID],
    });
    expect(documentEq).toHaveBeenCalledWith('document_id', DOCUMENT_ID);
    expect(result).toEqual({
      chunks: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          document_id: DOCUMENT_ID,
          content: 'Principles of Computer Design and quantitative analysis',
          chunk_index: 24,
          page_number: 25,
          similarity: expect.any(Number),
        },
      ],
      sources: [
        {
          chunk_id: '88888888-8888-4888-8888-888888888888',
          document_id: DOCUMENT_ID,
          document_title: 'Apuntes de prueba.pdf',
          page_number: 25,
        },
      ],
      message: 'Resultados encontrados con busqueda lexica de respaldo.',
    });
  });

  it('generate_quiz usa RAG y generateObject', async () => {
    const { context } = createContext();
    const tools = createAgentTools(context);

    const result = await runTool(tools.generate_quiz.execute, {
      topic: 'tema',
      num_questions: 1,
    });

    expect(generateObject).toHaveBeenCalled();
    expect(result).toEqual({
      questions: [
        {
          question: 'Pregunta',
          options: ['A', 'B', 'C', 'D'],
          correct_index: 0,
          explanation: 'Porque si.',
        },
      ],
      sources: EXPECTED_SOURCES,
    });
  });

  it('generate_flashcards usa RAG y devuelve JSON tipado', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        cards: [{ question: 'Q', answer: 'A' }],
      },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const { context } = createContext();
    const tools = createAgentTools(context);

    const result = await runTool(tools.generate_flashcards.execute, {
      topic: 'tema',
      num_cards: 1,
    });

    expect(generateObject).toHaveBeenCalled();
    expect(result).toEqual({
      cards: [{ question: 'Q', answer: 'A' }],
      sources: EXPECTED_SOURCES,
    });
  });

  it('generate_summary rechaza documentos no permitidos', async () => {
    const { context, from } = createContext({ allowedDocumentIds: [DOCUMENT_ID] });
    const tools = createAgentTools(context);

    const result = await runTool(tools.generate_summary.execute, {
      document_id: OTHER_DOCUMENT_ID,
      length: 'medium',
    });

    expect(from).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(result).toEqual({
      summary: '',
      sources: [],
      message: 'Documento no disponible o aun no esta listo.',
    });
  });

  it('generate_summary carga chunks ordenados por chunk_index', async () => {
    const { context, order } = createContext();
    const tools = createAgentTools(context);

    await runTool(tools.generate_summary.execute, {
      document_id: DOCUMENT_ID,
      length: 'short',
    });

    expect(order).toHaveBeenCalledWith('chunk_index', { ascending: true });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Primera parte'),
      })
    );
  });

  it('explain_concept usa RAG y generateText', async () => {
    const { context } = createContext();
    const tools = createAgentTools(context);

    const result = await runTool(tools.explain_concept.execute, {
      concept: 'concepto',
      level: 'beginner',
    });

    expect(embedQuery).toHaveBeenCalledWith('concepto');
    expect(generateText).toHaveBeenCalled();
    expect(result).toEqual({ explanation: 'Texto generado', sources: EXPECTED_SOURCES });
  });
});
