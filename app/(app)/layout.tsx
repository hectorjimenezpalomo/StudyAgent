/**
 * Layout para rutas autenticadas (/chat, /documents).
 * Codex: añadir aquí la nav lateral o superior, y carga de la sesión del usuario.
 */

import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 border-r border-slate-200 bg-slate-50 p-6">
        <Link href="/chat" className="text-xl font-bold">StudyAgent</Link>
        <nav className="mt-8 flex flex-col gap-2">
          <Link href="/chat" className="rounded px-3 py-2 hover:bg-slate-100">Chat</Link>
          <Link href="/documents" className="rounded px-3 py-2 hover:bg-slate-100">Documentos</Link>
        </nav>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
