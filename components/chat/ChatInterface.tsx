'use client';

/**
 * Componente cliente del chat. Usa useChat del AI SDK para conectarse a /api/chat.
 *
 * TODO Codex:
 * - Implementar con useChat de @ai-sdk/react.
 * - Renderizar mensajes con role user/assistant en burbujas distintas.
 * - Cuando el assistant invoque una tool, mostrar ToolCallDisplay con la herramienta usada.
 * - Input de texto al fondo con submit en Enter (Shift+Enter para nueva línea).
 * - Estado de loading mientras streamea.
 * - Manejar errores de la API mostrando un toast/banner.
 */

export function ChatInterface() {
  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200">
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-slate-400">UI del chat pendiente de implementar.</p>
      </div>
      <form className="border-t border-slate-200 p-4">
        <input
          type="text"
          placeholder="Pregúntale a tus apuntes..."
          className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
          disabled
        />
      </form>
    </div>
  );
}
