import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-5xl font-bold tracking-tight">StudyAgent</h1>
      <p className="mt-6 text-xl text-slate-600">
        Sube tus apuntes en PDF y conviértelos en un asistente de estudio:
        chatea con ellos, genera quizzes, resúmenes y fichas de repaso.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/login"
          className="rounded-lg bg-slate-900 px-6 py-3 text-white hover:bg-slate-700"
        >
          Empezar
        </Link>
        <a
          href="https://github.com/hectorjimenezpalomo/studyagent"
          className="rounded-lg border border-slate-300 px-6 py-3 hover:bg-slate-50"
        >
          Ver código
        </a>
      </div>
    </main>
  );
}
