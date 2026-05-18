import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamText } from 'ai';
import { createAgentTools } from '@/lib/ai/tools';
import {
  getOrCreateConversation,
  persistChatMessage,
  touchConversation,
} from '@/lib/chat/persistence';
import { SYSTEM_PROMPT_AGENT } from '@/lib/ai/prompts';
import { createClient } from '@/lib/supabase/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { POST, __chatTestUtils } from './route';

const testState = vi.hoisted(() => ({
  finishPromise: undefined as Promise<void> | undefined,
  conversationId: '55555555-5555-4555-8555-555555555555',
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn((model: string) => ({ model })),
}));

vi.mock('ai', () => ({
  convertToCoreMessages: vi.fn((messages: unknown) => messages),
  createDataStreamResponse: vi.fn(({ execute, headers }) => {
    const chunks: string[] = [];
    execute({
      write: (value: string) => chunks.push(value),
      writeData: vi.fn(),
      writeMessageAnnotation: vi.fn(),
      writeSource: vi.fn(),
      merge: vi.fn(),
      onError: undefined,
    });
    return new Response(chunks.join(''), { headers });
  }),
  formatDataStreamPart: vi.fn((_type: string, value: string) => value),
  streamText: vi.fn(
    (options: { onFinish?: (event: unknown) => Promise<void> | void }) => ({
      toDataStreamResponse: vi.fn((responseOptions?: { headers?: HeadersInit }) => {
      testState.finishPromise = Promise.resolve(
        options.onFinish?.({
          text: 'Respuesta del asistente',
          toolCalls: [{ toolCallId: 'call-1', toolName: 'search_documents', args: {} }],
          toolResults: [{ toolCallId: 'call-1', result: { chunks: [] } }],
        })
      );
      return new Response('model-stream', { headers: responseOptions?.headers });
    }),
  })),
}));

vi.mock('@/lib/ai/tools', () => ({
  createAgentTools: vi.fn(() => ({
    search_documents: { description: 'search_documents' },
    generate_quiz: { description: 'generate_quiz' },
    generate_summary: { description: 'generate_summary' },
    generate_flashcards: { description: 'generate_flashcards' },
    explain_concept: { description: 'explain_concept' },
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/chat/persistence', () => ({
  getOrCreateConversation: vi.fn(async () => ({
    conversationId: testState.conversationId,
    error: null,
  })),
  persistChatMessage: vi.fn(async () => ({ ok: true, error: null })),
  touchConversation: vi.fn(async () => undefined),
}));

const USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = testState.conversationId;

type MockSupabaseOptions = {
  user?: { id: string } | null;
  readyDocuments?: Array<{ id: string }>;
  readyDocumentsError?: { message: string } | null;
};

function createThenableQuery<T>(result: T) {
  return {
    in: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
}

function mockSupabase(options: MockSupabaseOptions = {}) {
  const readyDocumentsResult = {
    data: options.readyDocuments ?? [],
    error: options.readyDocumentsError ?? null,
  };

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? { id: USER_ID } : options.user },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => createThenableQuery(readyDocumentsResult)),
      })),
    })),
  };

  vi.mocked(createClient).mockResolvedValue(
    supabase as unknown as Awaited<ReturnType<typeof createClient>>
  );

  return supabase;
}

function chatRequest(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.finishPromise = undefined;
  });

  it('rechaza usuarios no autenticados', async () => {
    mockSupabase({ user: null });

    const response = await POST(chatRequest({ messages: [] }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'No autenticado' });
  });

  it('rechaza body invalido', async () => {
    mockSupabase();

    const response = await POST(chatRequest({ messages: [] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Body invalido' });
  });

  it('devuelve mensaje guiado si no hay documentos ready', async () => {
    mockSupabase({ readyDocuments: [] });

    const response = await POST(
      chatRequest({ messages: [{ role: 'user', content: 'Que sabes?' }] })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(__chatTestUtils.NO_READY_DOCUMENTS_MESSAGE);
    expect(response.headers.get('x-conversation-id')).toBe(CONVERSATION_ID);
    expect(createAgentTools).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
    expect(persistChatMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ role: 'user', text: 'Que sabes?' })
    );
    expect(persistChatMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        role: 'assistant',
        text: __chatTestUtils.NO_READY_DOCUMENTS_MESSAGE,
      })
    );
  });

  it('crea agente con tools, prompt del sistema y maxSteps', async () => {
    mockSupabase({
      readyDocuments: [{ id: '33333333-3333-4333-8333-333333333333' }],
    });

    const response = await POST(
      chatRequest({ messages: [{ role: 'user', content: 'Hazme un quiz' }] })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('model-stream');
    expect(response.headers.get('x-conversation-id')).toBe(CONVERSATION_ID);
    await testState.finishPromise;
    expect(createAgentTools).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        allowedDocumentIds: ['33333333-3333-4333-8333-333333333333'],
      })
    );
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: SYSTEM_PROMPT_AGENT,
        tools: expect.objectContaining({
          search_documents: expect.any(Object),
          generate_quiz: expect.any(Object),
          generate_summary: expect.any(Object),
          generate_flashcards: expect.any(Object),
          explain_concept: expect.any(Object),
        }),
        maxSteps: AI_CONFIG.agent.maxSteps,
      })
    );
    expect(persistChatMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ role: 'user', text: 'Hazme un quiz' })
    );
    expect(persistChatMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        role: 'assistant',
        text: 'Respuesta del asistente',
        toolCalls: expect.any(Array),
        toolResults: expect.any(Array),
      })
    );
    expect(touchConversation).toHaveBeenCalledWith(expect.any(Object), CONVERSATION_ID);
  });

  it('reutiliza conversation_id existente si viene en el body', async () => {
    mockSupabase({
      readyDocuments: [{ id: '33333333-3333-4333-8333-333333333333' }],
    });

    await POST(
      chatRequest({
        conversation_id: CONVERSATION_ID,
        messages: [{ role: 'user', content: 'Continua' }],
      })
    );

    expect(getOrCreateConversation).toHaveBeenCalledWith(
      expect.any(Object),
      USER_ID,
      CONVERSATION_ID,
      'Continua'
    );
  });
});
