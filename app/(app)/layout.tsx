import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-slate-50 p-4 md:w-60 md:border-b-0 md:border-r md:p-6">
        <Link href="/chat" className="text-xl font-bold">StudyAgent</Link>
        <nav className="mt-4 flex gap-2 md:mt-8 md:flex-col">
          <Link href="/chat" className="rounded px-3 py-2 hover:bg-slate-100">Chat</Link>
          <Link href="/documents" className="rounded px-3 py-2 hover:bg-slate-100">Documentos</Link>
        </nav>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
