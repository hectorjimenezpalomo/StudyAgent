/**
 * Cliente Supabase con service-role key. SE SALTA RLS.
 *
 * USAR SOLO EN ROUTE HANDLERS Y FUNCIONES DE lib/ai/ que necesiten
 * insertar datos atribuidos a un usuario después de validar la identidad
 * de ese usuario por otra vía.
 *
 * NUNCA importar este módulo desde un componente con 'use client'.
 * NUNCA llamarlo sin haber validado primero quién es el usuario.
 */

import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Faltan SUPABASE env vars para el admin client');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
