import { describe, expect, it } from 'vitest';
import { resolveRoute } from './route-guard';

const next = { action: 'next' };
const redirect = (to: string) => ({ action: 'redirect', to });

describe('resolveRoute sin sesión', () => {
  it.each(['/', '/add', '/progress', '/profile', '/onboarding'])(
    '%s manda a /login',
    (pathname) => {
      expect(resolveRoute({ pathname, hasSession: false, onboardingCompleted: null })).toEqual(
        redirect('/login'),
      );
    },
  );

  it.each([
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
    '/offline',
  ])('%s es accesible', (pathname) => {
    expect(resolveRoute({ pathname, hasSession: false, onboardingCompleted: null })).toEqual(next);
  });

  it('responde 401 en /api en vez de redirigir', () => {
    expect(
      resolveRoute({ pathname: '/api/foods/search', hasSession: false, onboardingCompleted: null }),
    ).toEqual({ action: 'unauthorized' });
  });

  it('no confunde prefijos parecidos', () => {
    expect(
      resolveRoute({ pathname: '/loginx', hasSession: false, onboardingCompleted: null }),
    ).toEqual(redirect('/login'));
    expect(
      resolveRoute({ pathname: '/apiary', hasSession: false, onboardingCompleted: null }),
    ).toEqual(redirect('/login'));
  });
});

describe('resolveRoute con sesión', () => {
  it('manda al onboarding si no lo completó', () => {
    expect(resolveRoute({ pathname: '/', hasSession: true, onboardingCompleted: false })).toEqual(
      redirect('/onboarding'),
    );
    expect(
      resolveRoute({ pathname: '/profile', hasSession: true, onboardingCompleted: false }),
    ).toEqual(redirect('/onboarding'));
  });

  it('deja ver el onboarding si no lo completó', () => {
    expect(
      resolveRoute({ pathname: '/onboarding', hasSession: true, onboardingCompleted: false }),
    ).toEqual(next);
  });

  it('no vuelve a mostrar el onboarding una vez completado', () => {
    expect(
      resolveRoute({ pathname: '/onboarding', hasSession: true, onboardingCompleted: true }),
    ).toEqual(redirect('/'));
  });

  it('deja pasar la app si completó el onboarding', () => {
    expect(resolveRoute({ pathname: '/', hasSession: true, onboardingCompleted: true })).toEqual(
      next,
    );
  });

  it.each(['/login', '/register', '/forgot-password'])('%s manda a / con sesión', (pathname) => {
    expect(resolveRoute({ pathname, hasSession: true, onboardingCompleted: true })).toEqual(
      redirect('/'),
    );
  });

  it('el link de recuperación funciona aunque falte el onboarding', () => {
    expect(
      resolveRoute({ pathname: '/reset-password', hasSession: true, onboardingCompleted: false }),
    ).toEqual(next);
    expect(
      resolveRoute({ pathname: '/auth/callback', hasSession: true, onboardingCompleted: false }),
    ).toEqual(next);
  });

  it('no redirige /api por onboarding', () => {
    expect(
      resolveRoute({ pathname: '/api/foods/search', hasSession: true, onboardingCompleted: false }),
    ).toEqual(next);
  });
});
