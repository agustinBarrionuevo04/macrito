import type { ActivityLevel, Goal, Sex } from '@/types';

/** Densidad energética (kcal/g). OMS, "Obesity: preventing and managing the global epidemic", p. 104. */
export const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9 } as const;

/**
 * PAL representativo por nivel. Son valores propios del proyecto (heredados de OpenNutriTracker):
 * cada uno cae dentro de su banda del IOM 2005 pero ninguna fuente los publica como tabla.
 */
export const PAL_BY_LEVEL: Record<ActivityLevel, number> = {
  sedentary: 1.25,
  low_active: 1.5,
  active: 1.75,
  very_active: 2.2,
};

/** 1 kg de grasa ≈ 7700 kcal; repartido en 7 días ≈ 1100 kcal/día por cada kg/semana. */
export const KCAL_PER_KG_PER_WEEK_DAILY = 1100;

/** Ajuste diario por defecto cuando no hay objetivo semanal. */
export const GOAL_KCAL_ADJUSTMENT: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 500,
};

/** Pisos de seguridad por defecto (kcal/día). Configurables vía `CalcOptions.minKcal`. */
export const DEFAULT_MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

/** Edad mínima aceptada, y desde cuándo aplican las ecuaciones de adultos del IOM (p. 204). */
export const MIN_AGE_YEARS = 13;
export const ADULT_EQUATION_AGE_YEARS = 19;
export const MAX_AGE_YEARS = 130;

export const HEIGHT_CM_RANGE = { min: 30, max: 300 } as const;
export const WEIGHT_KG_RANGE = { min: 2, max: 640 } as const;

/** Proteína por kg de peso corporal: valor por defecto según objetivo y rango configurable. */
export const DEFAULT_PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose: 2.0,
  maintain: 1.6,
  gain: 1.8,
};
export const PROTEIN_G_PER_KG_RANGE = { min: 0.8, max: 2.5 } as const;

/** Grasa por defecto y piso, como fracción de las kcal totales. */
export const DEFAULT_FAT_FRACTION = 0.25;
export const MIN_FAT_FRACTION = 0.2;

/** Presets de reparto de macros (fracciones de las kcal; suman 1). */
export const MACRO_PRESETS = {
  balanced: { carbs: 0.5, fat: 0.3, protein: 0.2 },
  /** Clásico de OpenNutriTracker. */
  classic: { carbs: 0.6, fat: 0.25, protein: 0.15 },
} as const;
