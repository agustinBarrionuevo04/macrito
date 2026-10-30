import { z } from 'zod';
import { es } from '@/lib/i18n/es';

const { errors } = es.auth;

const email = z.string().trim().toLowerCase().pipe(z.email(errors.invalidEmail));

const newPassword = z.string().min(8, errors.passwordTooShort).max(72, errors.passwordTooLong);

export const signInSchema = z.object({
  email,
  password: z.string().min(1, errors.passwordRequired),
});

export const registerSchema = z
  .object({ email, password: newPassword, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: errors.passwordMismatch,
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: errors.passwordMismatch,
  });

/**
 * Acepta solo rutas internas para el parámetro `next` del callback (evita open redirect).
 * Rechaza `//host`, `/\host` y URLs absolutas.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
