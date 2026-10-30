export type Sex = 'male' | 'female';

export type ActivityLevel = 'sedentary' | 'low_active' | 'active' | 'very_active';

export type Goal = 'lose' | 'maintain' | 'gain';

/** Fracciones de las kcal totales; deben sumar 1. */
export type MacroSplit = { carbs: number; fat: number; protein: number };

/** Refleja las columnas de `profiles` (1.1), ya en camelCase. */
export type UserProfile = {
  displayName?: string;
  sex: Sex;
  /** ISO `YYYY-MM-DD`. */
  birthDate: string;
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  weeklyGoalKg?: number;
  /** Ajuste manual de kcal (+/−). */
  kcalAdjustment: number;
  /** Si es `undefined`, se usa `macroSplit`. */
  proteinGPerKg?: number;
  macroSplit?: MacroSplit;
  /** Zona horaria IANA. */
  timezone: string;
};

export type DailyTargets = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};
