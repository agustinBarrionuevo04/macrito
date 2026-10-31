import {
  MIN_FAT_FRACTION,
  calcTargets,
  validateMacroSplit,
  type TargetsBreakdown,
} from '@/lib/nutrition';
import type { MacroSplit, UserProfile } from '@/types';

/** Proteína por kilo de peso: 0,8 g es la ingesta recomendada mínima; 3 g es un tope razonable para el cálculo. */
export const PROTEIN_G_PER_KG_RANGE = { min: 0.8, max: 3 } as const;

export type MacroEdit =
  /** Porcentajes de las calorías (enteros o con decimales); tienen que sumar 100. */
  | { mode: 'percent'; carbs: number; fat: number; protein: number }
  /** Proteína por kilo; grasa 25 % de las calorías y carbohidratos lo que sobra. */
  | { mode: 'g_per_kg'; proteinGPerKg: number }
  /** Sin configuración propia: proteína según el objetivo y grasa 25 %. */
  | { mode: 'default' };

export type MacroEditIssue =
  'not_number' | 'percent_range' | 'percent_sum' | 'fat_min' | 'per_kg_range';

const SUM_TOLERANCE = 0.05;

/** Primer problema del reparto, o `null` si es válido. */
export function macroEditIssue(edit: MacroEdit): MacroEditIssue | null {
  if (edit.mode === 'default') return null;
  if (edit.mode === 'g_per_kg') {
    if (!Number.isFinite(edit.proteinGPerKg)) return 'not_number';
    return edit.proteinGPerKg < PROTEIN_G_PER_KG_RANGE.min ||
      edit.proteinGPerKg > PROTEIN_G_PER_KG_RANGE.max
      ? 'per_kg_range'
      : null;
  }
  const parts = [edit.carbs, edit.fat, edit.protein];
  if (parts.some((p) => !Number.isFinite(p))) return 'not_number';
  if (parts.some((p) => p < 0 || p > 100)) return 'percent_range';
  if (Math.abs(parts[0]! + parts[1]! + parts[2]! - 100) > SUM_TOLERANCE) return 'percent_sum';
  if (edit.fat / 100 < MIN_FAT_FRACTION - 1e-9) return 'fat_min';
  return null;
}

/** Fracciones 0–1 (lo que guarda la base) a partir de porcentajes. */
export function splitFromPercent(edit: {
  carbs: number;
  fat: number;
  protein: number;
}): MacroSplit {
  const round = (value: number) => Math.round((value / 100) * 10_000) / 10_000;
  // Se corrige el redondeo en los carbohidratos para que la suma sea exactamente 1.
  const fat = round(edit.fat);
  const protein = round(edit.protein);
  return { carbs: Math.round((1 - fat - protein) * 10_000) / 10_000, fat, protein };
}

/** Columnas de `profiles` que escribe esta edición. Siempre las dos, para no dejar un modo a medias. */
export function rowFromMacroEdit(edit: MacroEdit): {
  macro_split: MacroSplit | null;
  protein_g_per_kg: number | null;
} {
  switch (edit.mode) {
    case 'percent':
      return { macro_split: splitFromPercent(edit), protein_g_per_kg: null };
    case 'g_per_kg':
      return { macro_split: null, protein_g_per_kg: edit.proteinGPerKg };
    case 'default':
      return { macro_split: null, protein_g_per_kg: null };
  }
}

/** El modo y los valores con los que arranca el editor según el perfil actual. */
export function macroEditFromProfile(
  profile: Pick<UserProfile, 'macroSplit' | 'proteinGPerKg'>,
): MacroEdit {
  if (profile.proteinGPerKg !== undefined)
    return { mode: 'g_per_kg', proteinGPerKg: profile.proteinGPerKg };
  if (profile.macroSplit) {
    const { carbs, fat, protein } = profile.macroSplit;
    const pct = (value: number) => Math.round(value * 1000) / 10;
    return { mode: 'percent', carbs: pct(carbs), fat: pct(fat), protein: pct(protein) };
  }
  return { mode: 'default' };
}

/** Metas con el reparto editado, para la vista previa. `null` si el reparto no es válido o no se puede calcular. */
export function previewMacroEdit(
  profile: UserProfile,
  edit: MacroEdit,
  today: string,
): TargetsBreakdown | null {
  if (macroEditIssue(edit) !== null) return null;
  const row = rowFromMacroEdit(edit);
  const next: UserProfile = { ...profile };
  delete next.macroSplit;
  delete next.proteinGPerKg;
  if (row.macro_split) next.macroSplit = row.macro_split;
  if (row.protein_g_per_kg !== null) next.proteinGPerKg = row.protein_g_per_kg;
  try {
    return calcTargets(next, { today });
  } catch {
    return null;
  }
}

export { validateMacroSplit };
