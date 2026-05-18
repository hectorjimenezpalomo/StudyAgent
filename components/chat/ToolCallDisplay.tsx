'use client';

/**
 * Muestra una invocación de herramienta dentro del chat.
 * Diseño: caja distinta a los mensajes normales, con nombre de la herramienta,
 * argumentos pasados y un resumen del resultado (collapse para ver detalle).
 *
 * TODO Codex: implementar.
 */

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  state: 'calling' | 'done' | 'error';
}

export function ToolCallDisplay({ toolName, args, result, state }: Props) {
  return (
    <div className="my-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="font-mono text-slate-600">
        {state === 'calling' ? 'Invocando' : state === 'done' ? 'Ejecutado' : 'Error'}: <span className="font-semibold">{toolName}</span>
      </div>
      {/* TODO: pretty-print de args y de result */}
    </div>
  );
}
