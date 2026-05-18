import { redirect } from 'next/navigation';
import {
  estimateTokensFromText,
  extractStoredText,
  type AppSupabaseClient,
} from '@/lib/chat/persistence';
import { AI_CONFIG } from '@/lib/ai/config';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

type MessageRow = Tables<'messages'>;

const GPT_4O_MINI_OUTPUT_USD_PER_1M = 0.6;

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(value);
}

export default async function AdminPage() {
  const supabase = (await createClient()) as AppSupabaseClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/admin');
  }

  const adminEmails = getAdminEmails();
  if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
    console.error('[admin] unauthorized', user.email);
    redirect('/chat');
  }

  const [{ count: conversationCount }, { count: messageCount }, { data: messages, error }] =
    await Promise.all([
      supabase.from('conversations').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('content'),
    ]);

  if (error) {
    console.error('[admin] messages', error);
  }

  const estimatedTokens = ((messages ?? []) as Pick<MessageRow, 'content'>[]).reduce(
    (total, message) => total + estimateTokensFromText(extractStoredText(message.content)),
    0
  );
  const estimatedCost =
    AI_CONFIG.chatModel === 'gpt-4o-mini'
      ? (estimatedTokens / 1_000_000) * GPT_4O_MINI_OUTPUT_USD_PER_1M
      : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-950">Admin</h1>
        <p className="mt-2 text-sm text-slate-600">
          Metrica basica sobre tus conversaciones persistidas.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Conversaciones</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {conversationCount ?? 0}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Mensajes</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {messageCount ?? 0}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Tokens estimados</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {estimatedTokens.toLocaleString('es')}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Coste aprox.</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {formatUsd(estimatedCost)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Modelo: {AI_CONFIG.chatModel}. La estimacion usa texto persistido y tarifa de salida
        de gpt-4o-mini como referencia; no sustituye el usage real de OpenAI.
      </p>
    </div>
  );
}
