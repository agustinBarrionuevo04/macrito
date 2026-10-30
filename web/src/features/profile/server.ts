import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { UserProfile } from '@/types';
import { PROFILE_COLUMNS, profileFromRow, profileRowSchema, type ProfileRow } from './mapping';

export type CurrentProfile = {
  userId: string;
  email: string | undefined;
  row: ProfileRow;
  /** `null` mientras falte algún dato obligatorio (onboarding sin terminar). */
  profile: UserProfile | null;
};

/** Perfil del usuario de la sesión, leído con RLS. `null` si no hay sesión o no hay fila. */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !data) return null;

  const row = profileRowSchema.parse(data);
  return { userId: user.id, email: user.email, row, profile: profileFromRow(row) };
}

export type WeightLog = { loggedOn: string; weightKg: number };

/** Últimos registros de peso del usuario (el más reciente primero). */
export async function getRecentWeights(userId: string, limit = 5): Promise<WeightLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('weight_logs')
    .select('logged_on, weight_kg')
    .eq('user_id', userId)
    .order('logged_on', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.flatMap((row) => {
    const weightKg = Number(row.weight_kg);
    return typeof row.logged_on === 'string' && Number.isFinite(weightKg)
      ? [{ loggedOn: row.logged_on, weightKg }]
      : [];
  });
}
