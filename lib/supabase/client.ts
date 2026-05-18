/**
 * Cliente Supabase para uso en componentes del cliente (browser).
 * Usar SOLO en componentes con `'use client'`.
 *
 * Para route handlers y server components, usar lib/supabase/server.ts.
 * Para operaciones que necesiten saltarse RLS, usar lib/supabase/admin.ts.
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
