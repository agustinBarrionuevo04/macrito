import type { MealType, Origin } from '@/types';

/** Nutrición de una entrada: valores ya calculados (snapshot), no dependen del alimento original. */
export type Snapshot = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

/** Entrada del diario tal como la usa la interfaz. */
export type DiaryEntry = Snapshot & {
  id: string;
  mealType: MealType;
  foodId: string | null;
  name: string;
  quantityG: number;
  origin: Origin;
  isEstimate: boolean;
  createdAt: string;
};

/** Comidas en el orden en que se muestran. */
export const MEAL_ORDER: readonly MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Resultado de una acción: `ok` con datos extra, o un mensaje de error ya traducido. */
export type DiaryResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: string };
