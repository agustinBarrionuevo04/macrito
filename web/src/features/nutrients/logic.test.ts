import { describe, expect, it } from 'vitest';
import type { UserProfile } from '@/types';
import { isValidKcalAdjustment, previewKcalAdjustment } from './kcal-adjustment';
import {
  macroEditFromProfile,
  macroEditIssue,
  previewMacroEdit,
  rowFromMacroEdit,
  splitFromPercent,
} from './macro-edit';
import { microCoverage, microReferences, microStatus } from './reference';

/** Hombre de 25 años, 80 kg, 180 cm, sedentario, bajando 0,5 kg/semana: TEE 2662,4 − 550 = 2112,4 kcal. */
const profile: UserProfile = {
  sex: 'male',
  birthDate: '2001-03-15',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'sedentary',
  goal: 'lose',
  weeklyGoalKg: -0.5,
  kcalAdjustment: 0,
  timezone: 'America/Argentina/Cordoba',
};
const TODAY = '2026-03-15';

describe('microReferences', () => {
  it('fibra 14 g por 1.000 kcal, azúcares 10 % de las kcal y sodio 2.000 mg', () => {
    expect(microReferences(2000)).toEqual({
      fiber: { kind: 'goal', value: 28 },
      sugar: { kind: 'limit', value: 50 }, // 200 kcal / 4
      sodium: { kind: 'limit', value: 2000 },
    });
    expect(microReferences(2112).fiber.value).toBe(30);
  });
  it('una meta inválida da referencias en 0 salvo el sodio', () => {
    for (const bad of [0, -5, Number.NaN]) {
      expect(microReferences(bad)).toMatchObject({
        fiber: { value: 0 },
        sugar: { value: 0 },
        sodium: { value: 2000 },
      });
    }
  });
});

describe('microStatus', () => {
  it('la fibra es una meta: llegar es bueno; el azúcar y el sodio son topes: pasarse es el aviso', () => {
    expect(microStatus(30, { kind: 'goal', value: 30 })).toBe('reached');
    expect(microStatus(45, { kind: 'goal', value: 30 })).toBe('reached'); // pasarse de la fibra no es un problema
    expect(microStatus(10, { kind: 'goal', value: 30 })).toBe('below');
    expect(microStatus(2000, { kind: 'limit', value: 2000 })).toBe('below'); // justo en el tope todavía no es "pasado"
    expect(microStatus(2001, { kind: 'limit', value: 2000 })).toBe('over');
  });
});

describe('microCoverage', () => {
  it('sin entradas, parcial o completo', () => {
    expect(microCoverage({ entries: 0, withData: 0 })).toBe('none');
    expect(microCoverage({ entries: 4, withData: 2 })).toBe('partial');
    expect(microCoverage({ entries: 3, withData: 3 })).toBe('complete');
  });
});

describe('macroEditIssue', () => {
  it('acepta reparto que suma 100 con grasa ≥ 20 %', () => {
    expect(macroEditIssue({ mode: 'percent', carbs: 50, fat: 30, protein: 20 })).toBeNull();
    expect(macroEditIssue({ mode: 'percent', carbs: 45.5, fat: 30, protein: 24.5 })).toBeNull();
  });
  it('rechaza lo que no suma 100, lo fuera de rango, la grasa muy baja y lo que no es número', () => {
    expect(macroEditIssue({ mode: 'percent', carbs: 50, fat: 30, protein: 30 })).toBe(
      'percent_sum',
    );
    expect(macroEditIssue({ mode: 'percent', carbs: 50, fat: 30, protein: 19 })).toBe(
      'percent_sum',
    );
    expect(macroEditIssue({ mode: 'percent', carbs: 110, fat: -5, protein: -5 })).toBe(
      'percent_range',
    );
    expect(macroEditIssue({ mode: 'percent', carbs: 60, fat: 15, protein: 25 })).toBe('fat_min');
    expect(macroEditIssue({ mode: 'percent', carbs: Number.NaN, fat: 30, protein: 20 })).toBe(
      'not_number',
    );
  });
  it('proteína por kilo entre 0,8 y 3', () => {
    expect(macroEditIssue({ mode: 'g_per_kg', proteinGPerKg: 1.8 })).toBeNull();
    expect(macroEditIssue({ mode: 'g_per_kg', proteinGPerKg: 0.8 })).toBeNull();
    expect(macroEditIssue({ mode: 'g_per_kg', proteinGPerKg: 3 })).toBeNull();
    expect(macroEditIssue({ mode: 'g_per_kg', proteinGPerKg: 0.5 })).toBe('per_kg_range');
    expect(macroEditIssue({ mode: 'g_per_kg', proteinGPerKg: 3.1 })).toBe('per_kg_range');
    expect(macroEditIssue({ mode: 'g_per_kg', proteinGPerKg: Number.NaN })).toBe('not_number');
  });
  it('"por defecto" siempre es válido', () => {
    expect(macroEditIssue({ mode: 'default' })).toBeNull();
  });
});

describe('splitFromPercent', () => {
  it('pasa a fracciones que suman exactamente 1', () => {
    expect(splitFromPercent({ carbs: 50, fat: 30, protein: 20 })).toEqual({
      carbs: 0.5,
      fat: 0.3,
      protein: 0.2,
    });
    const odd = splitFromPercent({ carbs: 33.4, fat: 33.3, protein: 33.3 });
    expect(odd.carbs + odd.fat + odd.protein).toBeCloseTo(1, 10);
  });
});

describe('rowFromMacroEdit', () => {
  it('siempre escribe las dos columnas: un modo no deja restos del otro', () => {
    expect(rowFromMacroEdit({ mode: 'percent', carbs: 50, fat: 30, protein: 20 })).toEqual({
      macro_split: { carbs: 0.5, fat: 0.3, protein: 0.2 },
      protein_g_per_kg: null,
    });
    expect(rowFromMacroEdit({ mode: 'g_per_kg', proteinGPerKg: 2 })).toEqual({
      macro_split: null,
      protein_g_per_kg: 2,
    });
    expect(rowFromMacroEdit({ mode: 'default' })).toEqual({
      macro_split: null,
      protein_g_per_kg: null,
    });
  });
});

describe('macroEditFromProfile', () => {
  it('arranca en el modo que tiene el perfil', () => {
    expect(macroEditFromProfile({})).toEqual({ mode: 'default' });
    expect(macroEditFromProfile({ proteinGPerKg: 1.6 })).toEqual({
      mode: 'g_per_kg',
      proteinGPerKg: 1.6,
    });
    expect(macroEditFromProfile({ macroSplit: { carbs: 0.5, fat: 0.3, protein: 0.2 } })).toEqual({
      mode: 'percent',
      carbs: 50,
      fat: 30,
      protein: 20,
    });
  });
  it('ida y vuelta: lo guardado se lee igual', () => {
    const edit = { mode: 'percent' as const, carbs: 45.5, fat: 30, protein: 24.5 };
    const row = rowFromMacroEdit(edit);
    expect(macroEditFromProfile({ macroSplit: row.macro_split ?? undefined })).toEqual(edit);
  });
});

describe('previewMacroEdit', () => {
  it('con porcentajes calcula los gramos desde las kcal (2.112,4 kcal, 50/30/20)', () => {
    const preview = previewMacroEdit(
      profile,
      { mode: 'percent', carbs: 50, fat: 30, protein: 20 },
      TODAY,
    );
    expect(preview?.kcal).toBeCloseTo(2112.4, 1);
    expect(preview?.protein_g).toBeCloseTo((2112.4 * 0.2) / 4, 1);
    expect(preview?.fat_g).toBeCloseTo((2112.4 * 0.3) / 9, 1);
    expect(preview?.macroMode).toBe('split');
  });
  it('con g/kg fija la proteína por peso (2 g/kg × 80 kg = 160 g)', () => {
    const preview = previewMacroEdit(profile, { mode: 'g_per_kg', proteinGPerKg: 2 }, TODAY);
    expect(preview?.protein_g).toBeCloseTo(160, 6);
    expect(preview?.macroMode).toBe('g_per_kg');
  });
  it('reemplaza lo que tuviera el perfil (no mezcla modos)', () => {
    const withSplit = { ...profile, macroSplit: { carbs: 0.6, fat: 0.25, protein: 0.15 } };
    const preview = previewMacroEdit(withSplit, { mode: 'g_per_kg', proteinGPerKg: 2 }, TODAY);
    expect(preview?.macroMode).toBe('g_per_kg');
    expect(previewMacroEdit(withSplit, { mode: 'default' }, TODAY)?.macroMode).toBe('default');
  });
  it('un reparto inválido no tiene vista previa, y no modifica el perfil', () => {
    const copy = JSON.stringify(profile);
    expect(
      previewMacroEdit(profile, { mode: 'percent', carbs: 60, fat: 30, protein: 30 }, TODAY),
    ).toBeNull();
    expect(JSON.stringify(profile)).toBe(copy);
  });
  it('avisa si la proteína pedida no entra en las calorías', () => {
    const preview = previewMacroEdit(profile, { mode: 'g_per_kg', proteinGPerKg: 3 }, TODAY);
    expect(preview?.protein_g).toBeCloseTo(240, 6); // 960 kcal de 2.112: sí entra
    // Mujer de 120 kg con ajuste de −1.000: la meta cae al piso de 1.200 kcal y 3 g/kg (1.440 kcal) no entra.
    const tiny = {
      ...profile,
      weightKg: 120,
      heightCm: 150,
      sex: 'female' as const,
      kcalAdjustment: -1000,
    };
    expect(
      previewMacroEdit(tiny, { mode: 'g_per_kg', proteinGPerKg: 3 }, TODAY)?.warnings.map(
        (w) => w.code,
      ),
    ).toContain('protein_capped');
  });
});

describe('kcal adjustment', () => {
  it('valida enteros entre −1.000 y +1.000', () => {
    for (const ok of [0, 50, -50, 1000, -1000]) expect(isValidKcalAdjustment(ok)).toBe(true);
    for (const bad of [1001, -1001, 2.5, Number.NaN, '100', null, undefined])
      expect(isValidKcalAdjustment(bad)).toBe(false);
  });
  it('la vista previa suma el ajuste a la meta calculada', () => {
    expect(previewKcalAdjustment(profile, 0, TODAY)?.kcal).toBeCloseTo(2112.4, 1);
    expect(previewKcalAdjustment(profile, 200, TODAY)?.kcal).toBeCloseTo(2312.4, 1);
    expect(previewKcalAdjustment(profile, -300, TODAY)?.manualAdjustment).toBe(-300);
  });
  it('un ajuste que baja de la meta mínima se corrige y avisa (piso de 1.500 kcal en hombres)', () => {
    const preview = previewKcalAdjustment(profile, -1000, TODAY);
    expect(preview?.kcal).toBe(1500);
    expect(preview?.warnings.map((w) => w.code)).toContain('below_kcal_floor');
  });
  it('un valor inválido no tiene vista previa', () => {
    expect(previewKcalAdjustment(profile, 5000, TODAY)).toBeNull();
  });
});
