import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { addDays } from '@/features/diary/dates';
import { HISTORY_DAYS, WEIGHT_LOOKBACK_DAYS } from './constants';
import { parseDayTotals, parseWeights } from './mapping';
import type { DayTotals, WeightPoint } from './types';

/**
 * Totales por día de los últimos 90 días (una sola consulta: `daily_totals` agrupa en la base) y pesos
 * de ese período más la semana anterior. `null` si alguna consulta falla: no se muestra un resumen a medias.
 */
export async function getProgressData(
  userId: string,
  today: string,
): Promise<{ totals: DayTotals[]; weights: WeightPoint[] } | null> {
  const supabase = await createClient();
  const from = addDays(today, -(HISTORY_DAYS - 1));

  const [totals, weights] = await Promise.all([
    supabase.rpc('daily_totals', { p_from: from, p_to: today }),
    supabase
      .from('weight_logs')
      .select('logged_on, weight_kg')
      .eq('user_id', userId)
      .gte('logged_on', addDays(from, -WEIGHT_LOOKBACK_DAYS))
      .lte('logged_on', today)
      .order('logged_on', { ascending: true }),
  ]);
  if (totals.error || weights.error) return null;
  return { totals: parseDayTotals(totals.data), weights: parseWeights(weights.data) };
}
