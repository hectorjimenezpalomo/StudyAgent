/**
 * Cliente Supabase para uso server-side: route handlers, server components,
 * server actions, middleware.
 *
 * Respeta RLS porque usa el anon key + el JWT del usuario autenticado
 * (vía cookies). Para saltarse RLS deliberadamente, usar admin.ts.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Llamado desde un Server Component; ignorar.
            // El middleware refrescará las cookies.
          }
        },
      },
    }
  );
}
