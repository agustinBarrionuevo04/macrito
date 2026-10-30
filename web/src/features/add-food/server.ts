import 'server-only';
import { foodRowSchema, rowToCatalogFood } from '@/lib/foods/repository';
import { toFood } from '@/lib/foods/ranking';
import { createClient } from '@/lib/supabase/server';
import type { Food } from '@/types';

export type StartingFoods = {
  /** Todos los favoritos del usuario (para marcar la estrella en cualquier resultado). */
  favoriteIds: string[];
  favorites: Food[];
  recents: Food[];
};

const RECENT_LIMIT = 15;
const RECENT_SCAN = 60;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function foodsByIds(supabase: Supabase, ids: string[]): Promise<Map<string, Food>> {
  const found = new Map<string, Food>();
  if (ids.length === 0) return found;
  const { data } = await supabase.from('foods').select('*').in('id', ids);
  for (const row of data ?? []) {
    const parsed = foodRowSchema.safeParse(row);
    if (parsed.success) found.set(parsed.data.id, toFood(rowToCatalogFood(parsed.data)));
  }
  return found;
}

/** Favoritos y últimos alimentos usados, para mostrar antes de buscar. */
export async function getStartingFoods(userId: string): Promise<StartingFoods> {
  const supabase = await createClient();

  const [favoriteRows, entryRows] = await Promise.all([
    supabase.from('favorite_foods').select('food_id').eq('user_id', userId),
    supabase
      .from('intake_entries')
      .select('food_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(RECENT_SCAN),
  ]);

  const idOf = (row: unknown) => {
    const id = (row as { food_id?: unknown }).food_id;
    return typeof id === 'string' ? id : null;
  };
  const favoriteIds = (favoriteRows.data ?? []).flatMap((row) => idOf(row) ?? []);
  const recentIds = [...new Set((entryRows.data ?? []).flatMap((row) => idOf(row) ?? []))].slice(
    0,
    RECENT_LIMIT,
  );

  const foods = await foodsByIds(supabase, [...new Set([...favoriteIds, ...recentIds])]);
  const pick = (ids: string[]) => ids.flatMap((id) => foods.get(id) ?? []);
  const favorites = pick(favoriteIds).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const favoriteSet = new Set(favoriteIds);

  return {
    favoriteIds,
    favorites,
    recents: pick(recentIds).filter((food) => !favoriteSet.has(food.id)),
  };
}
