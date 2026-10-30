/** Decide a dónde mandar una request según sesión y onboarding. Pura: no toca red ni cookies. */

export type RouteGuardInput = {
  pathname: string;
  hasSession: boolean;
  /** `null` si todavía no se consultó o no hay sesión. */
  onboardingCompleted: boolean | null;
};

export type RouteGuardResult =
  { action: 'next' } | { action: 'redirect'; to: string } | { action: 'unauthorized' };

/** Páginas solo para quien no tiene sesión. */
const GUEST_ONLY = ['/login', '/register', '/forgot-password'];

/**
 * Rutas accesibles con o sin sesión: el link de recuperación crea una sesión temporal y la página
 * offline la sirve el service worker sin saber si hay sesión.
 */
const OPEN = ['/auth', '/reset-password', '/offline'];

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function resolveRoute({
  pathname,
  hasSession,
  onboardingCompleted,
}: RouteGuardInput): RouteGuardResult {
  if (OPEN.some((base) => matches(pathname, base))) return { action: 'next' };

  if (!hasSession) {
    if (GUEST_ONLY.some((base) => matches(pathname, base))) return { action: 'next' };
    if (matches(pathname, '/api')) return { action: 'unauthorized' };
    return { action: 'redirect', to: '/login' };
  }

  if (GUEST_ONLY.some((base) => matches(pathname, base))) return { action: 'redirect', to: '/' };

  if (matches(pathname, '/api')) return { action: 'next' };

  if (matches(pathname, '/onboarding')) {
    return onboardingCompleted ? { action: 'redirect', to: '/' } : { action: 'next' };
  }

  if (onboardingCompleted === false) return { action: 'redirect', to: '/onboarding' };
  return { action: 'next' };
}
