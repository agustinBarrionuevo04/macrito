import { describe, expect, it } from 'vitest';
import { MACRO_PRESETS } from '@/lib/nutrition';
import { presetOf, profileFromRow, profileRowSchema, rowFromInput } from './mapping';
import type { ProfileInput } from './schema';

const baseRow = {
  display_name: 'Ana',
  sex: 'female',
  birth_date: '1996-03-15',
  height_cm: 165,
  weight_kg: '62.5',
  target_weight_kg: null,
  activity_level: 'low_active',
  goal: 'lose',
  weekly_goal_kg: -0.5,
  kcal_adjustment: 0,
  protein_g_per_kg: null,
  macro_split: null,
  timezone: 'America/Argentina/Cordoba',
  onboarding_completed_at: '2026-03-15T12:00:00Z',
};

const parse = (overrides: Record<string, unknown> = {}) =>
  profileRowSchema.parse({ ...baseRow, ...overrides });

describe('profileFromRow', () => {
  it('arma el perfil, aceptando numéricos como string y omitiendo lo nulo', () => {
    expect(profileFromRow(parse())).toEqual({
      displayName: 'Ana',
      sex: 'female',
      birthDate: '1996-03-15',
      heightCm: 165,
      weightKg: 62.5,
      activityLevel: 'low_active',
      goal: 'lose',
      weeklyGoalKg: -0.5,
      kcalAdjustment: 0,
      timezone: 'America/Argentina/Cordoba',
    });
  });

  it('incluye peso objetivo, g/kg y reparto si están', () => {
    const profile = profileFromRow(
      parse({
        target_weight_kg: 58,
        protein_g_per_kg: 1.8,
        macro_split: { carbs: 0.5, fat: 0.3, protein: 0.2 },
      }),
    );
    expect(profile).toMatchObject({
      targetWeightKg: 58,
      proteinGPerKg: 1.8,
      macroSplit: { carbs: 0.5, fat: 0.3, protein: 0.2 },
    });
  });

  it('devuelve null si falta algún dato obligatorio (usuario recién creado)', () => {
    const empty = {
      ...baseRow,
      sex: null,
      birth_date: null,
      height_cm: null,
      weight_kg: null,
      activity_level: null,
      goal: null,
    };
    expect(profileFromRow(profileRowSchema.parse(empty))).toBeNull();
    for (const field of ['sex', 'birth_date', 'height_cm', 'weight_kg', 'activity_level', 'goal']) {
      expect(profileFromRow(parse({ [field]: null })), field).toBeNull();
    }
  });

  it('un macro_split mal formado se ignora en vez de romper la lectura', () => {
    expect(profileFromRow(parse({ macro_split: { carbs: 'x' } }))).not.toHaveProperty('macroSplit');
    expect(profileFromRow(parse({ macro_split: 'texto' }))).not.toHaveProperty('macroSplit');
  });
});

describe('presetOf', () => {
  it('sin reparto ni g/kg es "alto en proteína" (el valor por defecto)', () => {
    expect(presetOf({})).toBe('high_protein');
  });

  it('reconoce los repartos de los presets', () => {
    expect(presetOf({ macroSplit: MACRO_PRESETS.balanced })).toBe('balanced');
    expect(presetOf({ macroSplit: MACRO_PRESETS.classic })).toBe('classic');
  });

  it('un reparto o g/kg propios son "custom"', () => {
    expect(presetOf({ macroSplit: { carbs: 0.4, fat: 0.3, protein: 0.3 } })).toBe('custom');
    expect(presetOf({ proteinGPerKg: 2 })).toBe('custom');
    expect(presetOf({ proteinGPerKg: 2, macroSplit: MACRO_PRESETS.balanced })).toBe('custom');
  });
});

describe('rowFromInput', () => {
  const input: ProfileInput = {
    displayName: 'Ana',
    sex: 'female',
    birthDate: '1996-03-15',
    heightCm: 165,
    weightKg: 62.5,
    targetWeightKg: 58,
    activityLevel: 'low_active',
    goal: 'lose',
    weeklyGoalKg: -0.5,
    macroPreset: 'balanced',
  };

  it('mapea a las columnas de profiles', () => {
    expect(rowFromInput(input)).toEqual({
      display_name: 'Ana',
      sex: 'female',
      birth_date: '1996-03-15',
      height_cm: 165,
      weight_kg: 62.5,
      target_weight_kg: 58,
      activity_level: 'low_active',
      goal: 'lose',
      weekly_goal_kg: -0.5,
      macro_split: MACRO_PRESETS.balanced,
      protein_g_per_kg: null,
    });
  });

  it('"alto en proteína" guarda macro_split en null; los opcionales ausentes, null', () => {
    const row = rowFromInput({
      ...input,
      macroPreset: 'high_protein',
      displayName: undefined,
      targetWeightKg: undefined,
      weeklyGoalKg: undefined,
    });
    expect(row).toMatchObject({
      macro_split: null,
      protein_g_per_kg: null,
      display_name: null,
      target_weight_kg: null,
      weekly_goal_kg: null,
    });
  });

  it('sin preset no toca las columnas de macros; sin peso no toca weight_kg', () => {
    const { weightKg: _w, macroPreset: _m, ...edit } = input;
    const row = rowFromInput(edit);
    expect(row).not.toHaveProperty('weight_kg');
    expect(row).not.toHaveProperty('macro_split');
    expect(row).not.toHaveProperty('protein_g_per_kg');
  });

  it('nunca escribe user_id, kcal_adjustment ni onboarding_completed_at', () => {
    const row = rowFromInput(input);
    for (const column of ['user_id', 'kcal_adjustment', 'onboarding_completed_at', 'timezone']) {
      expect(row).not.toHaveProperty(column);
    }
  });
});
