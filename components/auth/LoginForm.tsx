'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type AuthMode = 'signin' | 'signup';

function getRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/documents';
  }

  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const redirectTo = getRedirectPath(searchParams.get('redirect'));

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const credentials = {
      email: email.trim(),
      password,
    };

    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === 'signup' && !result.data.session) {
      setMessage('Cuenta creada. Revisa tu email para confirmar el acceso.');
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8">
        <p className="text-sm font-medium text-cyan-700">StudyAgent</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          {mode === 'signin' ? 'Iniciar sesion' : 'Crear cuenta'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Accede para subir PDFs y preparar tus documentos para el agente de
          estudio.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20"
          />
        </label>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? 'Procesando...'
            : mode === 'signin'
              ? 'Entrar'
              : 'Crear cuenta'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((current) => (current === 'signin' ? 'signup' : 'signin'));
          setError(null);
          setMessage(null);
        }}
        className="mt-5 text-sm font-medium text-cyan-700 hover:text-cyan-900"
      >
        {mode === 'signin'
          ? 'No tienes cuenta? Crea una'
          : 'Ya tienes cuenta? Inicia sesion'}
      </button>
    </div>
  );
}
