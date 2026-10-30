import { describe, expect, it } from 'vitest';
import { NutritionInputError } from './errors';
import { MACRO_PRESETS } from './constants';
import { splitMacros, validateMacroSplit, type MacroInput } from './macros';

const kcalOf = (m: { protein_g: number; carbs_g: number; fat_g: number }) =>
  m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;

describe('splitMacros — por defecto (proteína por objetivo, grasa 25 %)', () => {
  it('bajar de peso: 2.0 g/kg', () => {
    const r = splitMacros({ kcal: 2162.4, weightKg: 80, goal: 'lose' });
    expect(r.mode).toBe('default');
    expect(r.protein_g).toBeCloseTo(160, 6); // 2.0 × 80
    expect(r.fat_g).toBeCloseTo(60.0667, 3); // 25 % de 2162.4 = 540.6 kcal / 9
    expect(r.carbs_g).toBeCloseTo(245.45, 2); // (2162.4 − 640 − 540.6) / 4
  });

  it('mantener: 1.6 g/kg', () => {
    const r = splitMacros({ kcal: 2000, weightKg: 70, goal: 'maintain' });
    expect(r.protein_g).toBeCloseTo(112, 6);
  });

  it('subir de peso: 1.8 g/kg', () => {
    const r = splitMacros({ kcal: 3000, weightKg: 70, goal: 'gain' });
    expect(r.protein_g).toBeCloseTo(126, 6);
    expect(r.fat_g).toBeCloseTo(83.3333, 3);
    expect(r.carbs_g).toBeCloseTo(436.5, 6);
  });
});

describe('splitMacros — proteína por g/kg', () => {
  it('usa los g/kg pedidos y grasa 25 % si no hay split', () => {
    const r = splitMacros({ kcal: 2000, weightKg: 75, goal: 'lose', proteinGPerKg: 2.2 });
    expect(r.mode).toBe('g_per_kg');
    expect(r.protein_g).toBeCloseTo(165, 6);
    expect(r.fat_g).toBeCloseTo(55.5556, 3);
    expect(r.carbs_g).toBeCloseTo(210, 6);
  });

  it('toma la grasa de macroSplit.fat, e ignora carbos y proteína del split', () => {
    const r = splitMacros({
      kcal: 2000,
      weightKg: 75,
      goal: 'lose',
      proteinGPerKg: 2.2,
      macroSplit: { carbs: 0.5, fat: 0.3, protein: 0.2 },
    });
    expect(r.mode).toBe('g_per_kg');
    expect(r.protein_g).toBeCloseTo(165, 6);
    expect(r.fat_g).toBeCloseTo(66.6667, 3);
  });

  it('si proteína + grasa superan las kcal, recorta la grasa y deja los carbos en 0', () => {
    // Proteína 2.5 × 100 kg = 1000 kcal; la grasa pedida (300 kcal) solo tiene 200 disponibles.
    const r = splitMacros({ kcal: 1200, weightKg: 100, goal: 'lose', proteinGPerKg: 2.5 });
    expect(r.protein_g).toBeCloseTo(250, 6);
    expect(r.fat_g).toBeCloseTo(22.2222, 3);
    expect(r.carbs_g).toBe(0);
    expect(r.proteinCapped).toBe(false);
  });

  it('si la proteína sola supera las kcal, la recorta y lo avisa', () => {
    const r = splitMacros({ kcal: 800, weightKg: 100, goal: 'lose', proteinGPerKg: 2.5 });
    expect(r.protein_g).toBeCloseTo(200, 6);
    expect(r.fat_g).toBe(0);
    expect(r.carbs_g).toBe(0);
    expect(r.proteinCapped).toBe(true);
  });
});

describe('splitMacros — reparto porcentual', () => {
  it('Clásico 60/25/15 sobre 2000 kcal', () => {
    const r = splitMacros({
      kcal: 2000,
      weightKg: 70,
      goal: 'maintain',
      macroSplit: MACRO_PRESETS.classic,
    });
    expect(r.mode).toBe('split');
    expect(r.carbs_g).toBeCloseTo(300, 6);
    expect(r.fat_g).toBeCloseTo(55.5556, 3);
    expect(r.protein_g).toBeCloseTo(75, 6);
  });

  it('Equilibrado 50/30/20 sobre 2400 kcal', () => {
    const r = splitMacros({
      kcal: 2400,
      weightKg: 70,
      goal: 'maintain',
      macroSplit: MACRO_PRESETS.balanced,
    });
    expect(r.carbs_g).toBeCloseTo(300, 6);
    expect(r.fat_g).toBeCloseTo(80, 6);
    expect(r.protein_g).toBeCloseTo(120, 6);
  });

  it('g/kg tiene prioridad sobre el split para la proteína', () => {
    const r = splitMacros({
      kcal: 2000,
      weightKg: 70,
      goal: 'maintain',
      proteinGPerKg: 1.6,
      macroSplit: MACRO_PRESETS.classic,
    });
    expect(r.mode).toBe('g_per_kg');
    expect(r.protein_g).toBeCloseTo(112, 6);
  });

  it('respeta un split con poca grasa: el piso de 20 % es una validación de UI, no un recorte', () => {
    const r = splitMacros({
      kcal: 2000,
      weightKg: 70,
      goal: 'maintain',
      macroSplit: { carbs: 0.5, fat: 0.1, protein: 0.4 },
    });
    expect(r.fat_g).toBeCloseTo(22.2222, 3);
  });
});

describe('splitMacros — las kcal siempre cierran', () => {
  const kcals = [1200, 1500, 2000, 2500, 3500];
  const weights = [45, 70, 110];
  const goals = ['lose', 'maintain', 'gain'] as const;
  const variants: Partial<MacroInput>[] = [
    {},
    { proteinGPerKg: 0.8 },
    { proteinGPerKg: 2.5 },
    { macroSplit: MACRO_PRESETS.balanced },
    { macroSplit: MACRO_PRESETS.classic },
    { proteinGPerKg: 2, macroSplit: { carbs: 0.4, fat: 0.35, protein: 0.25 } },
  ];

  it('proteína·4 + carbos·4 + grasa·9 = kcal en todas las combinaciones', () => {
    for (const kcal of kcals) {
      for (const weightKg of weights) {
        for (const goal of goals) {
          for (const variant of variants) {
            const r = splitMacros({ kcal, weightKg, goal, ...variant });
            expect(kcalOf(r), JSON.stringify({ kcal, weightKg, goal, variant })).toBeCloseTo(
              kcal,
              6,
            );
            expect(r.protein_g).toBeGreaterThanOrEqual(0);
            expect(r.carbs_g).toBeGreaterThanOrEqual(0);
            expect(r.fat_g).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe('splitMacros — entradas inválidas', () => {
  const base = { kcal: 2000, weightKg: 70, goal: 'maintain' } as const;

  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY])('rechaza kcal = %s', (kcal) => {
    expect(() => splitMacros({ ...base, kcal })).toThrow(NutritionInputError);
  });

  it.each([0, -1, Number.NaN])('rechaza weightKg = %s', (weightKg) => {
    expect(() => splitMacros({ ...base, weightKg })).toThrow(NutritionInputError);
  });

  it.each([0, -1, Number.NaN])('rechaza proteinGPerKg = %s', (proteinGPerKg) => {
    expect(() => splitMacros({ ...base, proteinGPerKg })).toThrow(NutritionInputError);
  });

  it('rechaza un split que no suma 1 o con fracciones inválidas', () => {
    expect(() =>
      splitMacros({ ...base, macroSplit: { carbs: 0.5, fat: 0.3, protein: 0.3 } }),
    ).toThrow(NutritionInputError);
    expect(() =>
      splitMacros({ ...base, macroSplit: { carbs: 1.2, fat: -0.1, protein: -0.1 } }),
    ).toThrow(NutritionInputError);
    expect(() =>
      splitMacros({ ...base, macroSplit: { carbs: Number.NaN, fat: 0.5, protein: 0.5 } }),
    ).toThrow(NutritionInputError);
  });

  it('rechaza una fracción de grasa inválida en modo g/kg', () => {
    expect(() =>
      splitMacros({ ...base, proteinGPerKg: 1.6, macroSplit: { carbs: 0, fat: 1.5, protein: 0 } }),
    ).toThrow(NutritionInputError);
  });
});

describe('validateMacroSplit', () => {
  it('acepta los presets', () => {
    expect(validateMacroSplit(MACRO_PRESETS.balanced)).toEqual([]);
    expect(validateMacroSplit(MACRO_PRESETS.classic)).toEqual([]);
  });

  it('avisa si no suma 1 (con tolerancia de 0.001)', () => {
    expect(validateMacroSplit({ carbs: 0.5, fat: 0.3, protein: 0.3 })).toEqual(['sum_not_one']);
    expect(validateMacroSplit({ carbs: 0.5, fat: 0.3, protein: 0.2005 })).toEqual([]);
  });

  it('avisa si la grasa baja del piso de 20 %, e incluye el 20 % exacto', () => {
    expect(validateMacroSplit({ carbs: 0.55, fat: 0.15, protein: 0.3 })).toEqual(['fat_below_min']);
    expect(validateMacroSplit({ carbs: 0.5, fat: 0.2, protein: 0.3 })).toEqual([]);
  });

  it('avisa fracciones fuera de [0, 1] o no finitas', () => {
    expect(validateMacroSplit({ carbs: -0.1, fat: 0.6, protein: 0.5 })).toEqual([
      'invalid_fraction',
    ]);
    expect(validateMacroSplit({ carbs: Number.NaN, fat: 0.5, protein: 0.5 })).toEqual([
      'invalid_fraction',
    ]);
  });
});
