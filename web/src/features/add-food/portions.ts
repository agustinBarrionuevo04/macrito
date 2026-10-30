import type { Food, MealType, Origin, Portion } from '@/types';
import type { EntryDraft } from '@/types';
import { MAX_QUANTITY_G } from '@/features/diary/constants';
import { snapshotFromPer100g } from '@/features/diary/snapshot';
import type { Snapshot } from '@/features/diary/types';

/** Unidad en la que se elige la cantidad: gramos o una de las porciones del alimento. */
export type Unit = { kind: 'g' } | { kind: 'portion'; index: number };

/** Gramos que vale cada unidad (1 para gramos). */
export function unitGrams(food: Food, unit: Unit): number {
  if (unit.kind === 'g') return 1;
  return food.portions[unit.index]?.grams ?? 1;
}

/** Gramos totales de `amount` unidades. `null` si la cantidad no es válida (0, negativa o excesiva). */
export function totalGrams(food: Food, unit: Unit, amount: number | null): number | null {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  const grams = Math.round(amount * unitGrams(food, unit) * 100) / 100;
  return grams > 0 && grams <= MAX_QUANTITY_G ? grams : null;
}

/** Cantidad inicial: una unidad de la primera porción si el alimento tiene, si no 100 g. */
export function defaultSelection(food: Food): { unit: Unit; amount: number } {
  return food.portions.length > 0
    ? { unit: { kind: 'portion', index: 0 }, amount: 1 }
    : { unit: { kind: 'g' }, amount: 100 };
}

/** Nutrición de `grams` gramos del alimento, igual que la calcula el servidor al guardar. */
export function previewNutrition(food: Food, grams: number): Snapshot {
  return snapshotFromPer100g(food.per100g, grams);
}

export function buildDraft(input: {
  food: Food;
  grams: number;
  meal: MealType;
  origin: Origin;
}): EntryDraft {
  return {
    food: input.food,
    quantity_g: input.grams,
    meal_type: input.meal,
    origin: input.origin,
    is_estimate: false,
  };
}

/** Texto de una porción: "1 rebanada (30 g)". */
export function portionText(portion: Portion): string {
  return `${portion.label} (${Number(portion.grams.toFixed(2))} g)`;
}
