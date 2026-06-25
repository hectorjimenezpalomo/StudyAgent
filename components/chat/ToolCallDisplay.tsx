'use client';

import Link from 'next/link';
import type { Flashcard, QuizQuestion } from '@/types';

interface Props {
  toolName: string;
  args?: unknown;
  result?: unknown;
  state: 'partial-call' | 'call' | 'result';
}

type SourceCitation = {
  chunk_id?: string;
  document_id: string;
  document_title: string;
  page_number: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isQuizResult(value: unknown): value is { questions: QuizQuestion[]; message?: string } {
  return (
    isRecord(value) &&
    Array.isArray(value.questions) &&
    value.questions.every(
      (question) =>
        isRecord(question) &&
        typeof question.question === 'string' &&
        Array.isArray(question.options) &&
        typeof question.correct_index === 'number' &&
        typeof question.explanation === 'string'
    )
  );
}

function isFlashcardsResult(value: unknown): value is { cards: Flashcard[]; message?: string } {
  return (
    isRecord(value) &&
    Array.isArray(value.cards) &&
    value.cards.every(
      (card) =>
        isRecord(card) &&
        typeof card.question === 'string' &&
        typeof card.answer === 'string'
    )
  );
}

function isSourceCitation(value: unknown): value is SourceCitation {
  return (
    isRecord(value) &&
    typeof value.document_id === 'string' &&
    typeof value.document_title === 'string' &&
    (typeof value.page_number === 'number' || value.page_number === null) &&
    (typeof value.chunk_id === 'string' || value.chunk_id === undefined)
  );
}

function getSources(value: unknown): SourceCitation[] {
  if (!isRecord(value) || !Array.isArray(value.sources)) {
    return [];
  }

  const unique = new Map<string, SourceCitation>();
  for (const source of value.sources) {
    if (!isSourceCitation(source)) continue;
    const key = `${source.document_id}:${source.page_number ?? 'document'}`;
    unique.set(key, source);
  }
  return [...unique.values()];
}

function stateLabel(state: Props['state']) {
  if (state === 'result') {
    return 'Ejecutado';
  }

  if (state === 'call') {
    return 'Invocando';
  }

  return 'Preparando';
}

function PrettyJson({ value }: { value: unknown }) {
  if (value === undefined) {
    return null;
  }

  return (
    <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-white p-3 text-xs leading-5 text-slate-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function QuizResult({ result }: { result: { questions: QuizQuestion[]; message?: string } }) {
  if (result.questions.length === 0) {
    return (
      <p className="mt-2 text-sm text-slate-600">
        {result.message ?? 'Sin preguntas generadas.'}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {result.questions.map((question, index) => (
        <div
          key={`${question.question}-${index}`}
          className="rounded-md border border-cyan-100 bg-white p-3"
        >
          <p className="text-sm font-semibold text-slate-900">
            {index + 1}. {question.question}
          </p>
          <ol className="mt-2 space-y-1 text-sm text-slate-700">
            {question.options.map((option, optionIndex) => (
              <li
                key={`${option}-${optionIndex}`}
                className={
                  optionIndex === question.correct_index ? 'font-semibold text-cyan-800' : undefined
                }
              >
                {String.fromCharCode(65 + optionIndex)}. {option}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs leading-5 text-slate-500">{question.explanation}</p>
        </div>
      ))}
    </div>
  );
}

function FlashcardsResult({ result }: { result: { cards: Flashcard[]; message?: string } }) {
  if (result.cards.length === 0) {
    return (
      <p className="mt-2 text-sm text-slate-600">
        {result.message ?? 'Sin flashcards generadas.'}
      </p>
    );
  }

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {result.cards.map((card, index) => (
        <div
          key={`${card.question}-${index}`}
          className="rounded-md border border-amber-100 bg-white p-3"
        >
          <p className="text-xs font-semibold uppercase text-amber-700">Flashcard {index + 1}</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{card.question}</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{card.answer}</p>
        </div>
      ))}
    </div>
  );
}

function Sources({ sources }: { sources: SourceCitation[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <p className="text-xs font-medium text-slate-500">Fuentes recuperadas</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {sources.map((source) => (
          <li key={`${source.document_id}-${source.page_number ?? 'document'}`}>
            <Link
              href={`/documents#document-${source.document_id}`}
              className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-900 transition hover:bg-cyan-100"
            >
              {source.document_title}
              {source.page_number ? ` · p. ${source.page_number}` : ''}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ToolCallDisplay({ toolName, args, result, state }: Props) {
  const showStructuredQuiz = toolName === 'generate_quiz' && isQuizResult(result);
  const showStructuredFlashcards =
    toolName === 'generate_flashcards' && isFlashcardsResult(result);
  const sources = getSources(result);

  return (
    <div className="my-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-slate-600">
          {stateLabel(state)}: <span className="font-semibold">{toolName}</span>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">
          tool
        </span>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">
          Ver argumentos
        </summary>
        <PrettyJson value={args} />
      </details>

      {state === 'result' ? (
        <>
          {showStructuredQuiz ? (
            <QuizResult result={result} />
          ) : showStructuredFlashcards ? (
            <FlashcardsResult result={result} />
          ) : (
            <details
              className="mt-2"
              open={toolName === 'generate_summary' || toolName === 'explain_concept'}
            >
              <summary className="cursor-pointer text-xs font-medium text-slate-500">
                Ver resultado
              </summary>
              <PrettyJson value={result} />
            </details>
          )}
          <Sources sources={sources} />
        </>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Esperando resultado...</p>
      )}
    </div>
  );
}
