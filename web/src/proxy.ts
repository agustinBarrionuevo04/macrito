import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicEnv } from '@/lib/supabase/env';
import { resolveRoute } from '@/lib/supabase/route-guard';

/**
 * Refresca la sesión de Supabase y aplica las redirecciones de acceso:
 * sin sesión → /login; con sesión y sin onboarding → /onboarding.
 */
export async function proxy(request: NextRequest) {
  const { url, anonKey } = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser valida el JWT contra Supabase; getSession solo lo lee de la cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let onboardingCompleted: boolean | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('user_id', user.id)
      .maybeSingle();
    onboardingCompleted = profile?.onboarding_completed_at != null;
  }

  const result = resolveRoute({
    pathname: request.nextUrl.pathname,
    hasSession: user !== null,
    onboardingCompleted,
  });

  if (result.action === 'unauthorized') {
    return withCookies(NextResponse.json({ error: 'unauthorized' }, { status: 401 }), response);
  }
  if (result.action === 'redirect') {
    const target = request.nextUrl.clone();
    target.pathname = result.to;
    target.search = '';
    return withCookies(NextResponse.redirect(target), response);
  }
  return response;
}

/** Conserva las cookies de sesión refrescadas al responder con otra respuesta. */
function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export const config = {
  // Excluye estáticos de Next y cualquier archivo con extensión (íconos, manifest, sw.js...).
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
