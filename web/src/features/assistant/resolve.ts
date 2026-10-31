import { pickMatch } from '@/features/ai-photo/resolve';
import { snapshotFromPer100g } from '@/features/diary/snapshot';
import { sumSnapshots } from '@/features/diary/totals';
import type { Food, MealType } from '@/types';
import type { PlanItem, PlanMode, PlanOption, RawPlanOption, Remaining } from './types';

export type SearchFoods = (query: string) => Promise<Food[]>;

/** Una opción que pasa de lo que falta en más de esto (de las kcal) no sirve: se descarta. */
export const OVERSHOOT_RATIO = 1.25;
export const OVERSHOOT_MARGIN_KCAL = 50;

const CONCURRENCY = 4;

/** Busca cada nombre una sola vez (varias opciones repiten "arroz"). Un fallo de la base se propaga. */
async function lookup(
  queries: readonly string[],
  search: SearchFoods,
): Promise<Map<string, Food | null>> {
  const unique = [...new Set(queries)];
  const found = new Map<string, Food | null>();
  let next = 0;
  async function worker() {
    while (next < unique.length) {
      const query = unique[next++]!;
      found.set(query, pickMatch(query, await search(query)));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  return found;
}

/** Comida de cada opción: en modo "una comida" la pedida; en modo "día" la que dijo el modelo si es libre, y si no la próxima libre. */
function assignMeals(
  options: readonly RawPlanOption[],
  mode: PlanMode,
  meals: readonly MealType[],
): (MealType | null)[] {
  if (mode === 'meal') return options.map(() => meals[0] ?? 'dinner');
  const free = new Set(meals);
  const assigned = options.map((option) => {
    if (option.meal && free.has(option.meal)) {
      free.delete(option.meal);
      return option.meal;
    }
    return null;
  });
  return assigned.map((meal) => {
    if (meal) return meal;
    const first = meals.find((candidate) => free.has(candidate));
    if (!first) return null;
    free.delete(first);
    return first;
  });
}

/**
 * Pasa lo que propuso el modelo (nombres y gramos) a alimentos reales de la base, con su nutrición
 * calculada desde los valores por 100 g. Una opción con algún alimento que no está en la base se
 * descarta entera: mostrarla sin ese ítem subestimaría sus calorías. En modo "una comida" también se
 * descartan las que se pasan de lo que falta.
 */
export async function resolvePlan(
  options: readonly RawPlanOption[],
  search: SearchFoods,
  context: { mode: PlanMode; meals: readonly MealType[]; remaining: Remaining },
): Promise<PlanOption[]> {
  const found = await lookup(
    options.flatMap((option) => option.items.map((item) => item.query)),
    search,
  );
  const meals = assignMeals(options, context.mode, context.meals);

  const result: PlanOption[] = [];
  options.forEach((option, index) => {
    const meal = meals[index];
    if (!meal) return;
    const items: PlanItem[] = [];
    for (const raw of option.items) {
      const food = found.get(raw.query);
      if (!food) return;
      items.push({
        food,
        grams: raw.grams,
        nutrition: snapshotFromPer100g(food.per100g, raw.grams),
      });
    }
    const totals = sumSnapshots(items.map((item) => item.nutrition));
    if (
      context.mode === 'meal' &&
      totals.kcal > context.remaining.kcal * OVERSHOOT_RATIO + OVERSHOOT_MARGIN_KCAL
    ) {
      return;
    }
    result.push({ title: option.title, meal, items, totals });
  });
  return result;
}
