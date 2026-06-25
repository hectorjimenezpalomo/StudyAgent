'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { MessageFeedback } from './MessageFeedback';
import { ToolCallDisplay } from './ToolCallDisplay';
import type { ConversationSummary, StoredUiMessage } from '@/lib/chat/persistence';

type ToolInvocationLike = {
  toolCallId?: string;
  toolName: string;
  args?: unknown;
  result?: unknown;
  state: 'partial-call' | 'call' | 'result';
};

function getToolInvocations(message: unknown) {
  if (
    message &&
    typeof message === 'object' &&
    'toolInvocations' in message &&
    Array.isArray(message.toolInvocations)
  ) {
    return message.toolInvocations as ToolInvocationLike[];
  }

  return [];
}

function formatConversationDate(value: string) {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function MessageBubble({
  id,
  role,
  content,
  toolInvocations,
  canSubmitFeedback,
}: {
  id: string;
  role: string;
  content: string;
  toolInvocations: ToolInvocationLike[];
  canSubmitFeedback: boolean;
}) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[78%]">
        {content ? (
          <div
            className={[
              'whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-6',
              isUser
                ? 'bg-slate-950 text-white'
                : 'border border-slate-200 bg-white text-slate-800',
            ].join(' ')}
          >
            {content}
          </div>
        ) : null}

        {!isUser && toolInvocations.length > 0 ? (
          <div className="space-y-2">
            {toolInvocations.map((toolInvocation, index) => (
              <ToolCallDisplay
                key={toolInvocation.toolCallId ?? `${toolInvocation.toolName}-${index}`}
                toolName={toolInvocation.toolName}
                args={toolInvocation.args}
                result={toolInvocation.result}
                state={toolInvocation.state}
              />
            ))}
          </div>
        ) : null}
        {!isUser && content && canSubmitFeedback ? <MessageFeedback messageId={id} /> : null}
      </div>
    </div>
  );
}

export function ChatInterface({
  conversations,
  initialConversationId,
  initialMessages,
}: {
  conversations: ConversationSummary[];
  initialConversationId?: string;
  initialMessages: StoredUiMessage[];
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const persistedMessageIds = useMemo(
    () => new Set(initialMessages.map((message) => message.id)),
    [initialMessages]
  );
  const [conversationId, setConversationId] = useState(initialConversationId);
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    error,
    status,
    stop,
  } = useChat({
    api: '/api/chat',
    id: conversationId ?? 'new-chat',
    initialMessages,
    body: conversationId ? { conversation_id: conversationId } : undefined,
    maxSteps: 5,
    onResponse(response) {
      const nextConversationId = response.headers.get('x-conversation-id');
      if (nextConversationId && nextConversationId !== conversationId) {
        setConversationId(nextConversationId);
        router.replace(`/chat?conversation_id=${nextConversationId}`, {
          scroll: false,
        });
      }
    },
    onFinish() {
      router.refresh();
    },
  });

  const isBusy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, status]);

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="min-h-0 rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-3">
          <Link
            href="/chat"
            className="block rounded-md bg-slate-950 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Nuevo chat
          </Link>
        </div>
        <div className="max-h-72 overflow-y-auto p-2 lg:max-h-none">
          {conversations.length > 0 ? (
            <nav className="space-y-1">
              {conversations.map((conversation) => {
                const isActive = conversation.id === conversationId;
                return (
                  <Link
                    key={conversation.id}
                    href={`/chat?conversation_id=${conversation.id}`}
                    className={[
                      'block rounded-md px-3 py-2 text-sm transition',
                      isActive
                        ? 'bg-cyan-50 text-cyan-900'
                        : 'text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span className="block truncate font-medium">
                      {conversation.title ?? 'Chat sin titulo'}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {formatConversationDate(conversation.updated_at)}
                    </span>
                  </Link>
                );
              })}
            </nav>
          ) : (
            <p className="px-3 py-4 text-sm text-slate-500">
              Tus conversaciones apareceran aqui.
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-col rounded-md border border-slate-200 bg-slate-50">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Haz una pregunta sobre tus documentos listos.
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  StudyAgent buscara en tus PDFs y respondera citando las fuentes.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  id={message.id}
                  role={message.role}
                  content={message.content}
                  toolInvocations={getToolInvocations(message)}
                  canSubmitFeedback={persistedMessageIds.has(message.id)}
                />
              ))}
              {status === 'submitted' ? (
                <p className="px-1 text-sm text-slate-500">Buscando contexto...</p>
              ) : null}
            </div>
          )}
        </div>

        {error ? (
          <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error.message || 'No se pudo generar la respuesta.'}
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-3 border-t border-slate-200 bg-white p-4"
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (input.trim() && !isBusy) {
                  handleSubmit();
                }
              }
            }}
            rows={2}
            placeholder="Preguntale a tus apuntes..."
            disabled={isBusy}
            className="max-h-40 min-h-11 flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          {isBusy ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Parar
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Enviar
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
