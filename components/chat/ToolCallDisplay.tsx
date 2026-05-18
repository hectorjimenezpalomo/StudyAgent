'use client';

import type { Flashcard, QuizQuestion } from '@/types';

interface Props {
  toolName: string;
  args?: unknown;
  result?: unknown;
  state: 'partial-call' | 'call' | 'result';
}

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

export function ToolCallDisplay({ toolName, args, result, state }: Props) {
  const showStructuredQuiz = toolName === 'generate_quiz' && isQuizResult(result);
  const showStructuredFlashcards =
    toolName === 'generate_flashcards' && isFlashcardsResult(result);

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
        showStructuredQuiz ? (
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
        )
      ) : (
        <p className="mt-2 text-xs text-slate-500">Esperando resultado...</p>
      )}
    </div>
  );
}
