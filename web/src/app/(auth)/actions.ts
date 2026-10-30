'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { es } from '@/lib/i18n/es';
import { createClient } from '@/lib/supabase/server';
import { forgotPasswordSchema, registerSchema, resetPasswordSchema, signInSchema } from './schemas';

const { errors } = es.auth;

export type AuthState = {
  error?: string;
  message?: string;
  /** Email ingresado, para no vaciar el campo si hay error. */
  email?: string;
};

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? errors.generic;
}

async function getOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = formValues(formData);
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), email: values.email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error: error.code === 'invalid_credentials' ? errors.invalidCredentials : errors.generic,
      email: parsed.data.email,
    };
  }
  redirect('/');
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = formValues(formData);
  const parsed = registerSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), email: values.email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // El hook before_user_created de Postgres rechaza los emails fuera de la allowlist con 403.
    const notAllowed = error.status === 403 || /no est[aá] autorizado/i.test(error.message);
    const exists = error.code === 'user_already_exists';
    return {
      error: notAllowed ? errors.notAllowed : exists ? errors.alreadyRegistered : errors.generic,
      email: parsed.data.email,
    };
  }

  // Sin sesión = el proyecto exige confirmar el email (hoy desactivado).
  if (!data.session) return { message: es.auth.register.checkEmail, email: parsed.data.email };
  redirect('/');
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const values = formValues(formData);
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), email: values.email };

  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Supabase no distingue si la cuenta existe: el mensaje de éxito es el mismo para cualquier email.
  // Un fallo del envío (límite de mails, proveedor caído) sí se informa.
  if (error) return { error: errors.generic, email: parsed.data.email };
  return { message: es.auth.forgotPassword.sent };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetPasswordSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: errors.sessionExpired };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: errors.generic };
  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
