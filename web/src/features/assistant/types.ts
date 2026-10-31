import type { Snapshot } from '@/features/diary/types';
import type { Food, MealType } from '@/types';

/** Lo que pide el modelo, sin resolver contra la base: nombres y gramos. */
export type RawPlanItem = { query: string; grams: number };
export type RawPlanOption = { title: string; meal: MealType | null; items: RawPlanItem[] };

export type PlanItem = {
  food: Food;
  grams: number;
  /** Nutrición calculada desde los valores por 100 g del alimento de la base, nunca la del modelo. */
  nutrition: Snapshot;
};

export type PlanOption = {
  title: string;
  meal: MealType;
  items: PlanItem[];
  totals: Snapshot;
};

/** Cuánto falta del día para llegar a la meta (nunca negativo). */
export type Remaining = Snapshot;

export type PlanMode = 'meal' | 'day';

export type PlanResponse =
  | { status: 'ok'; options: PlanOption[]; remaining: Remaining }
  /** Ya se llegó (casi) a la meta: no se consulta a la IA. */
  | { status: 'reached'; remaining: Remaining };
