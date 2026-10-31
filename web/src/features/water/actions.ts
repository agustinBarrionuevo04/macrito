'use server';

import { revalidatePath } from 'next/cache';
import { es } from '@/lib/i18n/es';
import { createClient } from '@/lib/supabase/server';
import { amountSchema, dayInput, goalSchema } from './schemas';

const e = es.water.errors;

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentUserId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const firstMessage = (error: { issues: { message: string }[] }) =>
  error.issues[0]?.message ?? e.generic;

/** Suma una toma de agua al día. */
export async function addWater(date: unknown, ml: unknown): Promise<Result<{ id: string }>> {
  const day = dayInput.safeParse(date);
  if (!day.success) return fail(firstMessage(day.error));
  const amount = amountSchema.safeParse(ml);
  if (!amount.success) return fail(firstMessage(amount.error));

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data, error } = await supabase
    .from('water_logs')
    .insert({ user_id: userId, logged_on: day.data, ml: amount.data })
    .select('id')
    .single();
  if (error || !data) return fail(e.generic);
  revalidatePath('/');
  return { ok: true, id: String((data as { id: unknown }).id) };
}

/** Borra la última toma del día (la más reciente). */
export async function undoLastWater(date: unknown): Promise<Result<{ ml: number }>> {
  const day = dayInput.safeParse(date);
  if (!day.success) return fail(firstMessage(day.error));

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data: last, error } = await supabase
    .from('water_logs')
    .select('id, ml')
    .eq('user_id', userId)
    .eq('logged_on', day.data)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return fail(e.generic);
  const row = last?.[0] as { id: string; ml: unknown } | undefined;
  if (!row) return fail(e.nothingToUndo);

  const { data: deleted, error: deleteError } = await supabase
    .from('water_logs')
    .delete()
    .eq('id', row.id)
    .select('id');
  if (deleteError || !deleted?.length) return fail(e.generic);
  revalidatePath('/');
  return { ok: true, ml: Number(row.ml) };
}

/** Meta diaria de agua; `null` vuelve a la sugerida. */
export async function setWaterGoal(goal: unknown): Promise<Result> {
  const parsed = goalSchema.safeParse(goal);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data, error } = await supabase
    .from('profiles')
    .update({ water_goal_ml: parsed.data })
    .eq('user_id', userId)
    .select('user_id');
  if (error || !data?.length) return fail(e.generic);
  revalidatePath('/');
  revalidatePath('/profile');
  return { ok: true };
}
