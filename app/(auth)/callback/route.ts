import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function getRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/documents';
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirectPath = getRedirectPath(requestUrl.searchParams.get('redirect'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
    }

    console.error('[auth/callback] exchangeCodeForSession', error);
  }

  const loginUrl = new URL('/login', requestUrl.origin);
  loginUrl.searchParams.set('redirect', redirectPath);
  loginUrl.searchParams.set('error', 'No se pudo completar el inicio de sesion');
  return NextResponse.redirect(loginUrl);
}
