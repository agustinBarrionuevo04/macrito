import type { DiaryEntry } from '@/features/diary/types';
import type { DailyTargets, MealType } from '@/types';
import { buildPlanMessage } from './prompts';
import { MIN_REMAINING_KCAL, mealsToPlan, remainingFor } from './remaining';
import { resolvePlan, type SearchFoods } from './resolve';
import type { PlanMode, PlanResponse, RawPlanOption } from './types';

/** El modelo respondió, pero ninguna opción se pudo armar con alimentos de la base. */
export class NoOptionsError extends Error {
  constructor() {
    super('ninguna opción se pudo resolver con alimentos de la base');
    this.name = 'NoOptionsError';
  }
}

export type PlanDeps = {
  targets: DailyTargets;
  entries: readonly DiaryEntry[];
  /** Nombres de los alimentos que la persona suele comer. */
  habitual: readonly string[];
  search: SearchFoods;
  /** Le pide opciones al modelo (ya validadas) y cuenta contra el cupo diario. */
  ask: (message: string) => Promise<RawPlanOption[]>;
};

/**
 * Arma las opciones: calcula lo que falta, le pide al modelo qué comer (solo nombres y gramos) y
 * resuelve todo contra la base. Si ya se llegó a la meta no gasta una consulta.
 */
export async function createPlan(
  input: { mode: PlanMode; meal: MealType },
  deps: PlanDeps,
): Promise<PlanResponse> {
  const remaining = remainingFor(deps.targets, deps.entries);
  if (input.mode === 'meal' && remaining.kcal < MIN_REMAINING_KCAL) {
    return { status: 'reached', remaining };
  }

  const meals = input.mode === 'meal' ? [input.meal] : mealsToPlan(deps.entries);
  const raw = await deps.ask(
    buildPlanMessage({ mode: input.mode, meals, remaining, habitual: deps.habitual }),
  );
  const options = await resolvePlan(raw, deps.search, { mode: input.mode, meals, remaining });
  if (options.length === 0) throw new NoOptionsError();
  return { status: 'ok', options, remaining };
}
