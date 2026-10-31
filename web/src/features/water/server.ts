import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { resolveWaterGoalMl } from './goal';

export type WaterDay = {
  totalMl: number;
  logs: number;
  goalMl: number;
  /** `true` si la meta la puso el usuario; `false` si es la sugerida. */
  custom: boolean;
};

/** Agua del día y su meta. `null` si falla alguna consulta. */
export async function getWaterDay(
  userId: string,
  day: string,
  weightKg: number,
): Promise<WaterDay | null> {
  const supabase = await createClient();
  const [logs, profile] = await Promise.all([
    supabase.from('water_logs').select('ml').eq('user_id', userId).eq('logged_on', day),
    supabase.from('profiles').select('water_goal_ml').eq('user_id', userId).maybeSingle(),
  ]);
  if (logs.error || profile.error) return null;

  const totalMl = (logs.data ?? []).reduce((sum, row) => {
    const ml = Number((row as { ml: unknown }).ml);
    return Number.isFinite(ml) ? sum + ml : sum;
  }, 0);
  const rawGoal = (profile.data as { water_goal_ml?: unknown } | null)?.water_goal_ml;
  const { goalMl, custom } = resolveWaterGoalMl(
    typeof rawGoal === 'number' ? rawGoal : null,
    weightKg,
  );
  return { totalMl, logs: logs.data?.length ?? 0, goalMl, custom };
}

/** Meta propia guardada (`null` = usa la sugerida), para el editor del perfil. */
export async function getWaterGoalSetting(userId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('water_goal_ml')
    .eq('user_id', userId)
    .maybeSingle();
  const value = (data as { water_goal_ml?: unknown } | null)?.water_goal_ml;
  return typeof value === 'number' ? value : null;
}
