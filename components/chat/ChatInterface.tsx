'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[78%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-6',
          isUser
            ? 'bg-slate-950 text-white'
            : 'border border-slate-200 bg-white text-slate-800',
        ].join(' ')}
      >
        {content}
      </div>
    </div>
  );
}

export function ChatInterface() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
  });

  const isBusy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, status]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-slate-200 bg-slate-50">
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
                role={message.role}
                content={message.content}
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
  );
}
