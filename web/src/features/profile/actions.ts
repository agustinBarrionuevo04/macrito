'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { todayInTimeZone } from '@/lib/nutrition';
import { es } from '@/lib/i18n/es';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_TIMEZONE } from './constants';
import { profileRowSchema, rowFromInput } from './mapping';
import { createProfileInputSchema, weightInputSchema } from './schema';
import { weightIssue } from './validation';

const e = es.profile.errors;

export type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Usuario de la sesión y su zona horaria. `null` si no hay sesión. */
async function currentUser(
  supabase: Supabase,
): Promise<{ id: string; timezone: string; completed: boolean } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('timezone, onboarding_completed_at')
    .eq('user_id', user.id)
    .maybeSingle();
  const row = profileRowSchema
    .pick({ timezone: true, onboarding_completed_at: true })
    .safeParse(data);
  return {
    id: user.id,
    timezone: row.success ? row.data.timezone : DEFAULT_TIMEZONE,
    completed: row.success && row.data.onboarding_completed_at !== undefined,
  };
}

function firstMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? e.generic;
}

/**
 * Guarda el perfil del primer ingreso, registra el primer peso y marca el onboarding como hecho.
 * Es idempotente: si ya estaba completado no pisa nada y solo redirige. Al terminar redirige a `/`.
 */
export async function completeOnboarding(raw: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return fail(e.sessionExpired);

  if (!user.completed) {
    const today = todayInTimeZone(user.timezone);
    const parsed = createProfileInputSchema(today).safeParse(raw);
    if (!parsed.success) return fail(firstMessage(parsed.error));
    const input = parsed.data;
    // En el onboarding el peso es obligatorio (después se cambia registrándolo).
    const weightProblem = weightIssue(input.weightKg);
    if (weightProblem || input.weightKg === undefined) return fail(weightProblem ?? e.generic);

    // Primero el peso y recién después el perfil: si algo falla en el medio, reintentar es seguro
    // porque el peso es un upsert por día y el perfil sigue sin marcarse como completado.
    const weight = await supabase
      .from('weight_logs')
      .upsert(
        { user_id: user.id, logged_on: today, weight_kg: input.weightKg },
        { onConflict: 'user_id,logged_on' },
      );
    if (weight.error) return fail(e.generic);

    const profile = await supabase
      .from('profiles')
      .update({ ...rowFromInput(input), onboarding_completed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .select('user_id');
    if (profile.error || !profile.data || profile.data.length !== 1) return fail(e.generic);
  }

  redirect('/');
}

/** Edita los datos del perfil. El peso no se toca acá: se cambia con `logWeight`. */
export async function updateProfile(raw: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return fail(e.sessionExpired);

  const parsed = createProfileInputSchema(todayInTimeZone(user.timezone)).safeParse(raw);
  if (!parsed.success) return fail(firstMessage(parsed.error));
  // El peso del perfil sale de weight_logs: se descarta aunque el cliente lo mande.
  const { weightKg: _ignored, ...input } = parsed.data;

  const result = await supabase
    .from('profiles')
    .update(rowFromInput(input))
    .eq('user_id', user.id)
    .select('user_id');
  if (result.error || !result.data || result.data.length !== 1) return fail(e.generic);

  revalidatePath('/profile');
  return { ok: true };
}

/** Registra el peso de hoy en `weight_logs` y deja `profiles.weight_kg` con el registro más reciente. */
export async function logWeight(raw: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return fail(e.sessionExpired);

  const parsed = weightInputSchema.safeParse(raw);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const today = todayInTimeZone(user.timezone);
  const saved = await supabase
    .from('weight_logs')
    .upsert(
      { user_id: user.id, logged_on: today, weight_kg: parsed.data.weightKg },
      { onConflict: 'user_id,logged_on' },
    );
  if (saved.error) return fail(e.generic);

  const latest = await supabase
    .from('weight_logs')
    .select('weight_kg')
    .eq('user_id', user.id)
    .order('logged_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error || !latest.data) return fail(e.generic);

  const updated = await supabase
    .from('profiles')
    .update({ weight_kg: latest.data.weight_kg })
    .eq('user_id', user.id)
    .select('user_id');
  if (updated.error || !updated.data || updated.data.length !== 1) return fail(e.generic);

  revalidatePath('/profile');
  revalidatePath('/');
  return { ok: true };
}
