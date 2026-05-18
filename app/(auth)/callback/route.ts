/**
 * TODO Codex: handler de OAuth callback.
 * 1) Leer el `code` del query string.
 * 2) Intercambiarlo por una sesión con supabase.auth.exchangeCodeForSession(code).
 * 3) Redirigir a la URL indicada en `redirect` o a /chat.
 */

import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/chat', request.url));
}
