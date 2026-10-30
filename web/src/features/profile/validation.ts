import { MAX_AGE_YEARS, MIN_AGE_YEARS, calcAge } from '@/lib/nutrition';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { ACTIVITY_LEVELS, GOALS, INPUT_RANGES, SEXES, WEEKLY_PACE_OPTIONS } from './constants';
import type { ActivityLevel, Goal, Sex } from '@/types';

/**
 * Reglas de validación del perfil, una sola vez: las usan el wizard (paso a paso) y el esquema del
 * servidor. Cada función devuelve el mensaje de error, o `null` si el valor es válido.
 */
const e = es.profile.errors;

const inRange = (value: number | null | undefined, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function sexIssue(sex: Sex | null | undefined): string | null {
  return sex && SEXES.includes(sex) ? null : e.sex;
}

/** Fecha `YYYY-MM-DD` válida, con una edad de 13 a 130 años al día `today`. */
export function birthDateIssue(birthDate: string | null | undefined, today: string): string | null {
  if (!birthDate) return e.birthDate;
  try {
    const age = calcAge(birthDate, today);
    if (age < MIN_AGE_YEARS) return e.age;
    return age > MAX_AGE_YEARS ? e.birthDateInvalid : null;
  } catch {
    return e.birthDateInvalid;
  }
}

export function heightIssue(heightCm: number | null | undefined): string | null {
  const { min, max } = INPUT_RANGES.heightCm;
  return inRange(heightCm, min, max) ? null : t(e.height, { min, max });
}

export function weightIssue(weightKg: number | null | undefined): string | null {
  const { min, max } = INPUT_RANGES.weightKg;
  return inRange(weightKg, min, max) ? null : t(e.weight, { min, max });
}

export function activityIssue(level: ActivityLevel | null | undefined): string | null {
  return level && ACTIVITY_LEVELS.includes(level) ? null : e.activity;
}

export function goalIssue(goal: Goal | null | undefined): string | null {
  return goal && GOALS.includes(goal) ? null : e.goal;
}

/** Bajar y subir llevan uno de los ritmos ofrecidos; mantener no lleva ritmo. */
export function paceIssue(
  goal: Goal | null | undefined,
  weeklyGoalKg: number | null | undefined,
): string | null {
  if (goal === 'maintain') return weeklyGoalKg == null ? null : e.pace;
  if (goal !== 'lose' && goal !== 'gain') return null;
  const allowed: readonly number[] = WEEKLY_PACE_OPTIONS[goal];
  return weeklyGoalKg != null && allowed.includes(weeklyGoalKg) ? null : e.pace;
}

/** Opcional. Si está, tiene que ser un peso válido y estar del lado correcto del peso actual. */
export function targetWeightIssue(
  goal: Goal | null | undefined,
  weightKg: number | null | undefined,
  targetWeightKg: number | null | undefined,
): string | null {
  if (targetWeightKg == null) return null;
  const { min, max } = INPUT_RANGES.weightKg;
  if (!inRange(targetWeightKg, min, max)) return t(e.targetWeight, { min, max });
  if (typeof weightKg === 'number') {
    if (goal === 'lose' && targetWeightKg >= weightKg) return e.targetWeightLose;
    if (goal === 'gain' && targetWeightKg <= weightKg) return e.targetWeightGain;
  }
  return null;
}
