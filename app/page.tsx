import Link from 'next/link';

const flow = [
  ['1', 'Sube PDFs', 'Tus apuntes quedan privados y se preparan para busqueda semantica.'],
  ['2', 'Pregunta', 'El agente decide cuando buscar, resumir o explicar con herramientas.'],
  ['3', 'Practica', 'Genera quizzes y flashcards para repasar sin salir del chat.'],
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="mx-auto grid min-h-[86vh] max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase text-cyan-700">StudyAgent</p>
          <h1 className="mt-4 max-w-xl text-5xl font-bold leading-tight tracking-tight">
            Convierte tus PDFs en un asistente de estudio con memoria.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Sube apuntes, conversa con ellos, pide resumenes, crea tests y vuelve a
            cualquier hilo cuando necesites retomar una sesion.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Empezar
            </Link>
            <Link
              href="/documents"
              className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Subir PDFs
            </Link>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Chat con apuntes</p>
              <p className="text-xs text-slate-500">Biologia molecular - Repaso final</p>
            </div>
            <div className="space-y-4 p-4">
              <div className="ml-auto max-w-[78%] rounded-md bg-slate-950 px-4 py-3 text-sm text-white">
                Hazme un quiz sobre replicacion del ADN.
              </div>
              <div className="max-w-[82%] rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                He encontrado contexto en tus documentos y voy a generar preguntas tipo test.
              </div>
              <div className="rounded-md border border-cyan-100 bg-cyan-50 p-3">
                <p className="text-xs font-semibold uppercase text-cyan-800">generate_quiz</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  1. Que enzima sintetiza la nueva hebra?
                </p>
                <p className="mt-1 text-sm text-slate-600">A. ADN polimerasa</p>
                <p className="text-sm text-slate-600">B. Ligasa</p>
                <p className="text-sm text-slate-600">C. Helicase</p>
                <p className="text-sm text-slate-600">D. Primasa</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-10 md:grid-cols-3">
          {flow.map(([step, title, description]) => (
            <div key={step} className="rounded-md border border-slate-200 bg-white p-5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-700 text-sm font-semibold text-white">
                {step}
              </span>
              <h2 className="mt-4 text-lg font-semibold text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
