import 'server-only';
import { addDays } from '@/features/diary/dates';
import { createClient } from '@/lib/supabase/server';
import { ITEM_COLUMNS, RECIPE_COLUMNS, parseItems, parseRecipe, parseSummaries } from './mapping';
import type { RecipeDetail, RecipeSummary } from './types';
import type { MealType } from '@/types';

/** Recetas y combos del usuario, con sus kcal por porción (o totales). `null` si falla la consulta. */
export async function getRecipeList(userId: string): Promise<RecipeSummary[] | null> {
  const supabase = await createClient();
  const [recipes, items] = await Promise.all([
    supabase
      .from('recipes')
      .select(RECIPE_COLUMNS)
      .eq('user_id', userId)
      .order('name', { ascending: true }),
    supabase.from('recipe_items').select(ITEM_COLUMNS).eq('user_id', userId),
  ]);
  if (recipes.error || items.error) return null;
  return parseSummaries(recipes.data, items.data);
}

/** Una receta con sus ingredientes en orden. `null` si no existe o no es del usuario. */
export async function getRecipeDetail(userId: string, id: string): Promise<RecipeDetail | null> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('recipes')
    .select(RECIPE_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!row) return null;
  const { data: rows } = await supabase
    .from('recipe_items')
    .select(ITEM_COLUMNS)
    .eq('recipe_id', id)
    .order('position', { ascending: true });
  const items = parseItems(rows)
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.item);
  return parseRecipe(row, items);
}

export type RepeatCounts = Record<MealType, { yesterday: number; lastWeek: number }>;

const emptyCounts = (): RepeatCounts => ({
  breakfast: { yesterday: 0, lastWeek: 0 },
  lunch: { yesterday: 0, lastWeek: 0 },
  snack: { yesterday: 0, lastWeek: 0 },
  dinner: { yesterday: 0, lastWeek: 0 },
});

/**
 * Cuántas entradas tuvo cada comida ayer y el mismo día de la semana pasada (respecto de `day`, el día
 * al que se está agregando), para ofrecer "repetir" solo lo que existe.
 */
export async function getRepeatCounts(
  userId: string,
  day: string,
): Promise<{ counts: RepeatCounts; yesterday: string; lastWeek: string }> {
  const yesterday = addDays(day, -1);
  const lastWeek = addDays(day, -7);
  const counts = emptyCounts();
  const supabase = await createClient();
  const { data } = await supabase
    .from('intake_entries')
    .select('logged_on, meal_type')
    .eq('user_id', userId)
    .in('logged_on', [yesterday, lastWeek]);
  for (const row of data ?? []) {
    const meal = row.meal_type as MealType;
    if (!counts[meal]) continue;
    if (row.logged_on === yesterday) counts[meal].yesterday += 1;
    else if (row.logged_on === lastWeek) counts[meal].lastWeek += 1;
  }
  return { counts, yesterday, lastWeek };
}
