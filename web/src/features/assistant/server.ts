import 'server-only';
import { addDays } from '@/features/diary/dates';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { toFood } from '@/lib/foods/ranking';
import { createSupabaseFoodStore } from '@/lib/foods/repository';
import type { SearchFoods } from './resolve';

/** Cuántos días de historial se miran y cuántos alimentos se le cuentan al modelo. */
export const HABITUAL_DAYS = 30;
export const HABITUAL_LIMIT = 25;
const HISTORY_ROWS = 400;

/** Alimentos que la persona más registró en el último mes, del más al menos frecuente. */
export async function getHabitualFoods(userId: string, day: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('intake_entries')
    .select('food_id, name')
    .eq('user_id', userId)
    .gte('logged_on', addDays(day, -HABITUAL_DAYS))
    .lte('logged_on', day)
    .limit(HISTORY_ROWS);
  // El historial es un extra: sin él el asistente igual puede proponer comidas.
  if (error || !data) return [];

  const counts = new Map<string, { name: string; count: number }>();
  for (const row of data as { food_id: string | null; name: unknown }[]) {
    if (!row.food_id || typeof row.name !== 'string') continue;
    const current = counts.get(row.food_id);
    if (current) current.count += 1;
    else counts.set(row.food_id, { name: row.name, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
    .slice(0, HABITUAL_LIMIT)
    .map((entry) => entry.name);
}

/** Búsqueda solo en la base local (`ar_seed`, alimentos propios y lo ya guardado): nada de APIs externas. */
export async function createLocalSearch(): Promise<SearchFoods> {
  const store = createSupabaseFoodStore({ user: await createClient(), admin: createAdminClient() });
  return async (query) => (await store.search(query)).map(toFood);
}
