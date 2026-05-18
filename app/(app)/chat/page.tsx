/**
 * Página de chat. Server component que renderiza el componente cliente del chat.
 *
 * TODO Codex: implementar componente cliente components/chat/ChatInterface.tsx
 * usando useChat del @ai-sdk/react, apuntando a /api/chat. Mostrar tool calls
 * con components/chat/ToolCallDisplay.tsx según AGENTS.md regla 22.
 */

import { ChatInterface } from '@/components/chat/ChatInterface';

export default function ChatPage() {
  return (
    <div className="mx-auto flex h-screen max-w-4xl flex-col px-6 py-8">
      <h1 className="text-2xl font-bold">Chat</h1>
      <div className="mt-6 flex-1">
        <ChatInterface />
      </div>
    </div>
  );
}
