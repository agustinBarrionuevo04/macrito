import { calcTargets, type TargetsBreakdown } from '@/lib/nutrition';
import type { UserProfile } from '@/types';

/** Ajuste manual de calorías sobre la meta calculada: de −1.000 a +1.000 por día. */
export const KCAL_ADJUSTMENT_RANGE = { min: -1000, max: 1000 } as const;
export const KCAL_ADJUSTMENT_STEP = 50;

export function isValidKcalAdjustment(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= KCAL_ADJUSTMENT_RANGE.min &&
    value <= KCAL_ADJUSTMENT_RANGE.max
  );
}

/** Metas con otro ajuste manual, para la vista previa. `null` si el valor no es válido o no se puede calcular. */
export function previewKcalAdjustment(
  profile: UserProfile,
  adjustment: number,
  today: string,
): TargetsBreakdown | null {
  if (!isValidKcalAdjustment(adjustment)) return null;
  try {
    return calcTargets({ ...profile, kcalAdjustment: adjustment }, { today });
  } catch {
    return null;
  }
}
