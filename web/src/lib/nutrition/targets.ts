import type { DailyTargets, Goal, Sex, UserProfile } from '@/types';
import { assertSupportedAge, calcAge } from './age';
import {
  ADULT_EQUATION_AGE_YEARS,
  DEFAULT_MIN_KCAL,
  GOAL_KCAL_ADJUSTMENT,
  HEIGHT_CM_RANGE,
  KCAL_PER_KG_PER_WEEK_DAILY,
  WEIGHT_KG_RANGE,
} from './constants';
import { todayInTimeZone } from './date';
import { NutritionInputError, assertInRange } from './errors';
import { splitMacros, type MacroMode } from './macros';
import { calcTee, palValue, paCoefficient } from './tdee';

export type TargetsWarning =
  | { code: 'below_kcal_floor'; rawKcal: number; floorKcal: number }
  | { code: 'adult_equations_under_19'; age: number }
  | { code: 'weekly_goal_ignored'; reason: 'not_finite' | 'direction_mismatch' }
  | { code: 'protein_capped' };

export type CalcOptions = {
  /** Fecha de hoy `YYYY-MM-DD`. Por defecto, hoy en la zona horaria del perfil. */
  today?: string;
  /** Pisos de seguridad por sexo (kcal/día). */
  minKcal?: Partial<Record<Sex, number>>;
};

/** Desglose completo, sin redondear. Es lo que muestra la pantalla de "cómo se calculó mi meta". */
export type TargetsBreakdown = {
  age: number;
  pal: number;
  pa: number;
  tee: number;
  /** Ajuste por objetivo (semanal × 1100, o ±500). */
  goalAdjustment: number;
  manualAdjustment: number;
  /** TEE + ajustes, antes del piso. */
  rawKcal: number;
  floorKcal: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  macroMode: MacroMode;
  warnings: TargetsWarning[];
};

type GoalAdjustment = { kcal: number; ignored?: 'not_finite' | 'direction_mismatch' };

/**
 * Ajuste diario por objetivo. Con objetivo semanal: kg/semana × 1100. Si el valor no es finito o
 * contradice el objetivo (bajar con +0.5, subir con −0.5, mantener con ≠ 0), se ignora y se usa el
 * ajuste por defecto del objetivo.
 */
function goalAdjustment(goal: Goal, weeklyGoalKg: number | undefined): GoalAdjustment {
  const fallback = GOAL_KCAL_ADJUSTMENT[goal];
  if (weeklyGoalKg == null) return { kcal: fallback };
  if (!Number.isFinite(weeklyGoalKg)) return { kcal: fallback, ignored: 'not_finite' };

  const consistent =
    (goal === 'lose' && weeklyGoalKg < 0) ||
    (goal === 'gain' && weeklyGoalKg > 0) ||
    (goal === 'maintain' && weeklyGoalKg === 0);
  if (!consistent) return { kcal: fallback, ignored: 'direction_mismatch' };

  return { kcal: weeklyGoalKg * KCAL_PER_KG_PER_WEEK_DAILY };
}

export function calcTargets(profile: UserProfile, options: CalcOptions = {}): TargetsBreakdown {
  assertInRange(profile.weightKg, WEIGHT_KG_RANGE.min, WEIGHT_KG_RANGE.max, 'weightKg');
  assertInRange(profile.heightCm, HEIGHT_CM_RANGE.min, HEIGHT_CM_RANGE.max, 'heightCm');
  if (!Number.isFinite(profile.kcalAdjustment)) {
    throw new NutritionInputError('kcalAdjustment debe ser un número');
  }

  const today = options.today ?? todayInTimeZone(profile.timezone);
  const age = calcAge(profile.birthDate, today);
  assertSupportedAge(age);

  const warnings: TargetsWarning[] = [];
  if (age < ADULT_EQUATION_AGE_YEARS) warnings.push({ code: 'adult_equations_under_19', age });

  const pal = palValue(profile.activityLevel);
  const pa = paCoefficient(pal, profile.sex);
  const tee = calcTee({
    sex: profile.sex,
    age,
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    activityLevel: profile.activityLevel,
  });

  const adjustment = goalAdjustment(profile.goal, profile.weeklyGoalKg);
  if (adjustment.ignored)
    warnings.push({ code: 'weekly_goal_ignored', reason: adjustment.ignored });

  const rawKcal = tee + adjustment.kcal + profile.kcalAdjustment;
  const floorKcal = options.minKcal?.[profile.sex] ?? DEFAULT_MIN_KCAL[profile.sex];
  const kcal = Math.max(rawKcal, floorKcal);
  if (rawKcal < floorKcal) warnings.push({ code: 'below_kcal_floor', rawKcal, floorKcal });

  const macros = splitMacros({
    kcal,
    weightKg: profile.weightKg,
    goal: profile.goal,
    proteinGPerKg: profile.proteinGPerKg,
    macroSplit: profile.macroSplit,
  });
  if (macros.proteinCapped) warnings.push({ code: 'protein_capped' });

  return {
    age,
    pal,
    pa,
    tee,
    goalAdjustment: adjustment.kcal,
    manualAdjustment: profile.kcalAdjustment,
    rawKcal,
    floorKcal,
    kcal,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    macroMode: macros.mode,
    warnings,
  };
}

/** Contrato 1.3: metas diarias redondeadas a enteros. */
export function computeTargets(profile: UserProfile, options: CalcOptions = {}): DailyTargets {
  const t = calcTargets(profile, options);
  return {
    kcal: Math.round(t.kcal),
    protein_g: Math.round(t.protein_g),
    carbs_g: Math.round(t.carbs_g),
    fat_g: Math.round(t.fat_g),
  };
}
