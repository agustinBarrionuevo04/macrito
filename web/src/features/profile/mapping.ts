import { z } from 'zod';
import type { MacroSplit, UserProfile } from '@/types';
import { MACRO_PRESET_IDS, MACRO_PRESET_SPLITS, type MacroPresetId } from './constants';
import type { ProfileInput } from './schema';

const numeric = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());
const nullableNumeric = numeric.nullish().transform((v) => v ?? undefined);

const macroSplitSchema = z
  .object({ carbs: z.number(), fat: z.number(), protein: z.number() })
  .nullish()
  .catch(undefined)
  .transform((v) => v ?? undefined);

/** Fila de `public.profiles` tal como la devuelve PostgREST. */
export const profileRowSchema = z.object({
  display_name: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  sex: z
    .enum(['male', 'female'])
    .nullish()
    .transform((v) => v ?? undefined),
  birth_date: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  height_cm: nullableNumeric,
  weight_kg: nullableNumeric,
  target_weight_kg: nullableNumeric,
  activity_level: z
    .enum(['sedentary', 'low_active', 'active', 'very_active'])
    .nullish()
    .transform((v) => v ?? undefined),
  goal: z
    .enum(['lose', 'maintain', 'gain'])
    .nullish()
    .transform((v) => v ?? undefined),
  weekly_goal_kg: nullableNumeric,
  kcal_adjustment: numeric,
  protein_g_per_kg: nullableNumeric,
  macro_split: macroSplitSchema,
  timezone: z.string(),
  onboarding_completed_at: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
});

export type ProfileRow = z.infer<typeof profileRowSchema>;

/** Columnas de `profiles` que lee la app, para el `select`. */
export const PROFILE_COLUMNS =
  'display_name, sex, birth_date, height_cm, weight_kg, target_weight_kg, activity_level, goal, weekly_goal_kg, kcal_adjustment, protein_g_per_kg, macro_split, timezone, onboarding_completed_at';

/** Perfil completo para calcular metas, o `null` si todavía falta algún dato obligatorio. */
export function profileFromRow(row: ProfileRow): UserProfile | null {
  const { sex, birth_date, height_cm, weight_kg, activity_level, goal } = row;
  if (!sex || !birth_date || !height_cm || !weight_kg || !activity_level || !goal) return null;

  const profile: UserProfile = {
    sex,
    birthDate: birth_date,
    heightCm: height_cm,
    weightKg: weight_kg,
    activityLevel: activity_level,
    goal,
    kcalAdjustment: row.kcal_adjustment,
    timezone: row.timezone,
  };
  if (row.display_name) profile.displayName = row.display_name;
  if (row.target_weight_kg !== undefined) profile.targetWeightKg = row.target_weight_kg;
  if (row.weekly_goal_kg !== undefined) profile.weeklyGoalKg = row.weekly_goal_kg;
  if (row.protein_g_per_kg !== undefined) profile.proteinGPerKg = row.protein_g_per_kg;
  if (row.macro_split) profile.macroSplit = row.macro_split;
  return profile;
}

const sameSplit = (a: MacroSplit, b: MacroSplit) =>
  Math.abs(a.carbs - b.carbs) < 1e-9 &&
  Math.abs(a.fat - b.fat) < 1e-9 &&
  Math.abs(a.protein - b.protein) < 1e-9;

/** Qué preset de macros tiene el perfil; `custom` si el reparto no coincide con ninguno (3-K). */
export function presetOf(
  profile: Pick<UserProfile, 'macroSplit' | 'proteinGPerKg'>,
): MacroPresetId | 'custom' {
  if (profile.proteinGPerKg !== undefined) return 'custom';
  if (!profile.macroSplit) return 'high_protein';
  const { macroSplit } = profile;
  return (
    MACRO_PRESET_IDS.find((id) => {
      const split = MACRO_PRESET_SPLITS[id];
      return split !== null && sameSplit(split, macroSplit);
    }) ?? 'custom'
  );
}

/** Columnas a escribir en `profiles` a partir de lo que ingresó el usuario. */
export function rowFromInput(input: ProfileInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    display_name: input.displayName ?? null,
    sex: input.sex,
    birth_date: input.birthDate,
    height_cm: input.heightCm,
    target_weight_kg: input.targetWeightKg ?? null,
    activity_level: input.activityLevel,
    goal: input.goal,
    weekly_goal_kg: input.weeklyGoalKg ?? null,
  };
  if (input.weightKg !== undefined) row.weight_kg = input.weightKg;
  // Sin preset no se tocan las columnas de macros (por ejemplo un reparto personalizado de 3-K).
  if (input.macroPreset) {
    row.macro_split = MACRO_PRESET_SPLITS[input.macroPreset];
    row.protein_g_per_kg = null;
  }
  return row;
}
