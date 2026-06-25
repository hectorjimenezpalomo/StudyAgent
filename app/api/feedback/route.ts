import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const feedbackSchema = z.object({
  message_id: z.string().uuid(),
  rating: z.enum(['helpful', 'not_helpful']),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error('[api/feedback] json', error);
    return Response.json({ error: 'Body invalido' }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Body invalido' }, { status: 400 });
  }

  const { data: message, error: messageError } = await supabase
    .from('messages')
    .select('id')
    .eq('id', parsed.data.message_id)
    .maybeSingle();
  if (messageError) {
    console.error('[api/feedback] message', messageError);
    return Response.json({ error: 'Error al validar el mensaje' }, { status: 500 });
  }
  if (!message) {
    return Response.json({ error: 'Mensaje no encontrado' }, { status: 404 });
  }

  const { error: feedbackError } = await supabase.from('message_feedback').upsert(
    {
      user_id: user.id,
      message_id: message.id,
      rating: parsed.data.rating,
      note: parsed.data.note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,message_id' }
  );
  if (feedbackError) {
    console.error('[api/feedback] upsert', feedbackError);
    return Response.json({ error: 'No se pudo guardar el feedback' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
