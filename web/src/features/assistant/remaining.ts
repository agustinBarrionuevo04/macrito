import { MEAL_ORDER, type DiaryEntry, type Snapshot } from '@/features/diary/types';
import { sumSnapshots } from '@/features/diary/totals';
import type { DailyTargets, MealType } from '@/types';
import type { Remaining } from './types';

/** Menos que esto de calorías por comer y no tiene sentido pedirle una comida a la IA. */
export const MIN_REMAINING_KCAL = 150;

const round1 = (value: number) => Math.round(value * 10) / 10;
const left = (target: number, consumed: number) => Math.max(0, round1(target - consumed));

/** Lo que falta del día para llegar a la meta; un macro ya cumplido queda en 0 (no se "debe" nada). */
export function remainingFor(targets: DailyTargets, entries: readonly DiaryEntry[]): Remaining {
  const consumed: Snapshot = sumSnapshots(entries);
  return {
    kcal: left(targets.kcal, consumed.kcal),
    protein_g: left(targets.protein_g, consumed.protein_g),
    carbs_g: left(targets.carbs_g, consumed.carbs_g),
    fat_g: left(targets.fat_g, consumed.fat_g),
  };
}

/**
 * Comidas que todavía no tienen nada cargado, en orden del día. Si ya hay algo en todas, la cena:
 * es lo que suele quedar para decidir.
 */
export function mealsToPlan(entries: readonly DiaryEntry[]): MealType[] {
  const used = new Set(entries.map((entry) => entry.mealType));
  const free = MEAL_ORDER.filter((meal) => !used.has(meal));
  return free.length > 0 ? free : ['dinner'];
}
