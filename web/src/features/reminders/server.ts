import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MealType } from '@/types';
import { DEFAULT_REMINDER_TIMES, REMINDER_MEALS } from './constants';
import { normalizeTime } from './time';

export type ReminderRow = { meal: MealType; enabled: boolean; remindAt: string };

/** Las cuatro comidas con lo guardado; las que no tienen fila vienen apagadas con la hora sugerida. */
export async function getReminderSettings(userId: string): Promise<ReminderRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reminder_settings')
    .select('meal_type, enabled, remind_at')
    .eq('user_id', userId);
  if (error) return null;
  const saved = new Map(
    ((data ?? []) as { meal_type: string; enabled: unknown; remind_at: unknown }[]).map((row) => [
      row.meal_type,
      row,
    ]),
  );
  return REMINDER_MEALS.map((meal) => {
    const row = saved.get(meal);
    return {
      meal,
      enabled: row?.enabled === true,
      remindAt: normalizeTime(row?.remind_at) ?? DEFAULT_REMINDER_TIMES[meal],
    };
  });
}
