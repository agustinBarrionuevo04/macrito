import type { Goal, MacroSplit } from '@/types';
import {
  DEFAULT_FAT_FRACTION,
  DEFAULT_PROTEIN_G_PER_KG,
  KCAL_PER_G,
  MIN_FAT_FRACTION,
} from './constants';
import { NutritionInputError, assertFinitePositive } from './errors';

/**
 * - `g_per_kg`: la proteína se fija por peso corporal; la grasa es `macroSplit.fat` (o 25 %) y
 *   los carbohidratos son lo que sobra.
 * - `split`: reparto porcentual explícito.
 * - `default`: sin configuración del usuario → proteína por g/kg según el objetivo, grasa 25 %.
 */
export type MacroMode = 'g_per_kg' | 'split' | 'default';

export type MacroInput = {
  kcal: number;
  weightKg: number;
  goal: Goal;
  proteinGPerKg?: number | null;
  macroSplit?: MacroSplit | null;
};

export type MacroGrams = {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  mode: MacroMode;
  /** La proteína pedida superaba las kcal totales y se recortó. */
  proteinCapped: boolean;
};

const SPLIT_TOLERANCE = 0.001;

export type MacroSplitIssue = 'invalid_fraction' | 'sum_not_one' | 'fat_below_min';

/** Valida un reparto porcentual. Para formularios (2-E, 3-K); `splitMacros` solo exige lo mínimo. */
export function validateMacroSplit(split: MacroSplit): MacroSplitIssue[] {
  const issues: MacroSplitIssue[] = [];
  const parts = [split.carbs, split.fat, split.protein];
  if (parts.some((p) => !Number.isFinite(p) || p < 0 || p > 1)) {
    issues.push('invalid_fraction');
    return issues;
  }
  if (Math.abs(parts[0]! + parts[1]! + parts[2]! - 1) > SPLIT_TOLERANCE) issues.push('sum_not_one');
  if (split.fat < MIN_FAT_FRACTION) issues.push('fat_below_min');
  return issues;
}

/** Reparte las kcal en gramos de proteína, carbohidratos y grasa. */
export function splitMacros({
  kcal,
  weightKg,
  goal,
  proteinGPerKg,
  macroSplit,
}: MacroInput): MacroGrams {
  assertFinitePositive(kcal, 'kcal');
  assertFinitePositive(weightKg, 'weightKg');

  if (proteinGPerKg == null && macroSplit != null) {
    const issues = validateMacroSplit(macroSplit).filter((i) => i !== 'fat_below_min');
    if (issues.length > 0) {
      throw new NutritionInputError(`macroSplit inválido: ${issues.join(', ')}`);
    }
    return {
      protein_g: (kcal * macroSplit.protein) / KCAL_PER_G.protein,
      carbs_g: (kcal * macroSplit.carbs) / KCAL_PER_G.carbs,
      fat_g: (kcal * macroSplit.fat) / KCAL_PER_G.fat,
      mode: 'split',
      proteinCapped: false,
    };
  }

  const mode: MacroMode = proteinGPerKg == null ? 'default' : 'g_per_kg';
  const perKg = proteinGPerKg ?? DEFAULT_PROTEIN_G_PER_KG[goal];
  assertFinitePositive(perKg, 'proteinGPerKg');
  const fatFraction = macroSplit?.fat ?? DEFAULT_FAT_FRACTION;
  if (!Number.isFinite(fatFraction) || fatFraction < 0 || fatFraction > 1) {
    throw new NutritionInputError(`fracción de grasa inválida (recibido: ${fatFraction})`);
  }

  // Prioridad: proteína, después grasa, y los carbohidratos reciben el resto.
  const wantedProteinKcal = perKg * weightKg * KCAL_PER_G.protein;
  const proteinKcal = Math.min(wantedProteinKcal, kcal);
  const fatKcal = Math.min(fatFraction * kcal, kcal - proteinKcal);
  const carbsKcal = kcal - proteinKcal - fatKcal;

  return {
    protein_g: proteinKcal / KCAL_PER_G.protein,
    carbs_g: carbsKcal / KCAL_PER_G.carbs,
    fat_g: fatKcal / KCAL_PER_G.fat,
    mode,
    proteinCapped: wantedProteinKcal > kcal,
  };
}
