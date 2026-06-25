import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export default async function AdminPage() {
  const supabase = await createClient();
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

  // This is intentionally an admin client only after the authenticated email
  // allowlist check above. The normal server client remains RLS-bound.
  const adminSupabase = createAdminClient();
  const [
    { count: conversationCount },
    { count: messageCount },
    { count: documentCount },
    { data: traces, error },
    { data: feedback, error: feedbackError },
  ] =
    await Promise.all([
      adminSupabase.from('conversations').select('id', { count: 'exact', head: true }),
      adminSupabase.from('messages').select('id', { count: 'exact', head: true }),
      adminSupabase.from('documents').select('id', { count: 'exact', head: true }),
      adminSupabase
        .from('trace_events')
        .select('latency_ms, input_tokens, output_tokens, estimated_cost_usd, status, stage, model')
        .order('created_at', { ascending: false })
        .limit(1000),
      adminSupabase
        .from('message_feedback')
        .select('rating')
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

  if (error) {
    console.error('[admin] traces', error);
  }
  if (feedbackError) {
    console.error('[admin] feedback', feedbackError);
  }

  const traceRows = traces ?? [];
  const inputTokens = traceRows.reduce((total, trace) => total + (trace.input_tokens ?? 0), 0);
  const outputTokens = traceRows.reduce((total, trace) => total + (trace.output_tokens ?? 0), 0);
  const estimatedCost = traceRows.reduce(
    (total, trace) => total + (trace.estimated_cost_usd ?? 0),
    0
  );
  const latencies = traceRows
    .map((trace) => trace.latency_ms)
    .filter((latency): latency is number => latency !== null);
  const failedIngestions = traceRows.filter(
    (trace) => trace.stage === 'ingestion' && trace.status === 'error'
  ).length;
  const feedbackRows = feedback ?? [];
  const helpfulFeedback = feedbackRows.filter((item) => item.rating === 'helpful').length;
  const helpfulRate =
    feedbackRows.length > 0 ? Math.round((helpfulFeedback / feedbackRows.length) * 100) : 0;

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
          <p className="text-sm text-slate-500">Documentos</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {documentCount ?? 0}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Trazas recientes</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {traceRows.length.toLocaleString('es')}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Tokens de entrada</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {inputTokens.toLocaleString('es')}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Tokens de salida</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {outputTokens.toLocaleString('es')}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Latencia p50 / p95</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {percentile(latencies, 50)} / {percentile(latencies, 95)} ms
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Ingestas fallidas</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {failedIngestions}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Feedback útil</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {helpfulRate}%
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Ventana: últimas {traceRows.length.toLocaleString('es')} trazas. Se registra uso real
        cuando el proveedor lo devuelve; el coste será cero hasta configurar una tarifa por modelo.
        Coste registrado: {formatUsd(estimatedCost)}.
      </p>
    </div>
  );
}
