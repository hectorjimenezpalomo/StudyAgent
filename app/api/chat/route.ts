import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const bodySchema = z.object({
  messages: z.array(z.unknown()),
  document_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch (error) {
    console.error('[api/chat] json', error);
    return Response.json({ error: 'Body invalido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Body invalido' }, { status: 400 });
  }

  console.log(`[api/chat] user=${user.id} messages=${parsed.data.messages.length}`);

  return Response.json(
    { error: 'Chat no implementado hasta la Fase 3' },
    { status: 501 }
  );
}
