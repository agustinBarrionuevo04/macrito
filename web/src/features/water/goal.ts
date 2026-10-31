/** Mililitros de agua por kilo de peso para la meta sugerida (regla práctica de 30 a 35 ml/kg). */
export const WATER_ML_PER_KG = 35;
export const WATER_GOAL_MIN_ML = 500;
export const WATER_GOAL_MAX_ML = 10_000;
/** La sugerencia se acota y se redondea a 100 ml. */
const SUGGESTED_RANGE = { min: 1500, max: 4000 } as const;
export const MAX_WATER_PER_LOG_ML = 5000;
/** Tomas rápidas que ofrece la pantalla (ml): vaso, lata, botella chica y botella. */
export const WATER_QUICK_AMOUNTS = [200, 330, 500, 1000] as const;

/** Meta sugerida según el peso: 35 ml por kilo, redondeada a 100 ml y entre 1,5 y 4 litros. */
export function suggestedWaterGoalMl(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return SUGGESTED_RANGE.min;
  const raw = Math.round((weightKg * WATER_ML_PER_KG) / 100) * 100;
  return Math.min(Math.max(raw, SUGGESTED_RANGE.min), SUGGESTED_RANGE.max);
}

/** La meta propia si la hay y es válida; si no, la sugerida. */
export function resolveWaterGoalMl(
  custom: number | null | undefined,
  weightKg: number,
): { goalMl: number; custom: boolean } {
  if (
    typeof custom === 'number' &&
    Number.isInteger(custom) &&
    custom >= WATER_GOAL_MIN_ML &&
    custom <= WATER_GOAL_MAX_ML
  ) {
    return { goalMl: custom, custom: true };
  }
  return { goalMl: suggestedWaterGoalMl(weightKg), custom: false };
}
