import type { MealType } from '@/types';
import { MEAL_ORDER, type DiaryEntry, type Snapshot } from './types';

const toCents = (value: number) => Math.round(value * 100);

/**
 * Suma exacta de los snapshots: se acumula en centésimas enteras y recién al final se vuelve a
 * unidades. Sumar decimales directamente da resultados como 0.30000000000000004.
 */
export function sumSnapshots(snapshots: readonly Snapshot[]): Snapshot {
  const total = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const s of snapshots) {
    total.kcal += toCents(s.kcal);
    total.protein_g += toCents(s.protein_g);
    total.carbs_g += toCents(s.carbs_g);
    total.fat_g += toCents(s.fat_g);
  }
  return {
    kcal: total.kcal / 100,
    protein_g: total.protein_g / 100,
    carbs_g: total.carbs_g / 100,
    fat_g: total.fat_g / 100,
  };
}

export type EntriesByMeal = Record<MealType, DiaryEntry[]>;

/** Agrupa por comida, conservando el orden de entrada dentro de cada una. */
export function groupByMeal(entries: readonly DiaryEntry[]): EntriesByMeal {
  const groups = Object.fromEntries(
    MEAL_ORDER.map((meal) => [meal, [] as DiaryEntry[]]),
  ) as EntriesByMeal;
  for (const entry of entries) groups[entry.mealType].push(entry);
  return groups;
}

export type KcalStatus = { remaining: number; over: boolean };

/** Calorías que quedan (o que se pasaron) respecto de la meta. */
export function kcalStatus(target: number, consumed: number): KcalStatus {
  const remaining = Math.round(target - consumed);
  return { remaining: Math.abs(remaining), over: remaining < 0 };
}
