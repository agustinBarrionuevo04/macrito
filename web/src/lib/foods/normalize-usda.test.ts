import { describe, expect, it } from 'vitest';
import { normalizeUsdaFood } from './normalize-usda';

const nutrient = (nutrientNumber: string, value: number) => ({ nutrientNumber, value });

const base = {
  fdcId: 171265,
  description: 'Beef, ground, 85% lean meat / 15% fat, raw',
  dataType: 'SR Legacy',
  foodNutrients: [
    nutrient('208', 215),
    nutrient('203', 18.59),
    nutrient('204', 15),
    nutrient('205', 0),
    nutrient('291', 0),
    nutrient('269', 0),
    nutrient('307', 66),
  ],
};

describe('normalizeUsdaFood', () => {
  it('normaliza un alimento genérico', () => {
    expect(normalizeUsdaFood(base)).toEqual({
      id: '',
      source: 'usda',
      sourceId: '171265',
      name: 'Beef, ground, 85% lean meat / 15% fat, raw',
      per100g: {
        kcal: 215,
        protein_g: 18.59,
        carbs_g: 0,
        fat_g: 15,
        fiber_g: 0,
        sugar_g: 0,
        sodium_mg: 66,
      },
      portions: [],
    });
  });

  it('acepta Foundation y descarta Branded y otros tipos', () => {
    expect(normalizeUsdaFood({ ...base, dataType: 'Foundation' })).not.toBeNull();
    expect(normalizeUsdaFood({ ...base, dataType: 'Branded' })).toBeNull();
    expect(normalizeUsdaFood({ ...base, dataType: 'Survey (FNDDS)' })).toBeNull();
    expect(normalizeUsdaFood({ ...base, dataType: undefined })).toBeNull();
  });

  it('usa energía Atwater si falta el 208 (Foundation), y kJ como último recurso', () => {
    const without208 = base.foodNutrients.filter((n) => n.nutrientNumber !== '208');
    expect(
      normalizeUsdaFood({ ...base, foodNutrients: [...without208, nutrient('958', 210)] })?.per100g
        .kcal,
    ).toBe(210);
    expect(
      normalizeUsdaFood({ ...base, foodNutrients: [...without208, nutrient('957', 212)] })?.per100g
        .kcal,
    ).toBe(212);
    expect(
      normalizeUsdaFood({ ...base, foodNutrients: [...without208, nutrient('268', 1046)] })?.per100g
        .kcal,
    ).toBe(250);
  });

  it('descarta si falta energía o algún macro', () => {
    const drop = (n: string) => base.foodNutrients.filter((x) => x.nutrientNumber !== n);
    expect(normalizeUsdaFood({ ...base, foodNutrients: drop('208') })).toBeNull();
    expect(normalizeUsdaFood({ ...base, foodNutrients: drop('203') })).toBeNull();
    expect(normalizeUsdaFood({ ...base, foodNutrients: drop('204') })).toBeNull();
    expect(normalizeUsdaFood({ ...base, foodNutrients: drop('205') })).toBeNull();
  });

  it('descarta valores imposibles y omite opcionales ausentes', () => {
    expect(
      normalizeUsdaFood({
        ...base,
        foodNutrients: [nutrient('208', 5000), ...base.foodNutrients.slice(1)],
      }),
    ).toBeNull();
    const minimal = normalizeUsdaFood({
      ...base,
      foodNutrients: [
        nutrient('208', 215),
        nutrient('203', 18),
        nutrient('204', 15),
        nutrient('205', 0),
      ],
    });
    expect(minimal?.per100g).toEqual({ kcal: 215, protein_g: 18, carbs_g: 0, fat_g: 15 });
  });

  it('acepta números de nutriente numéricos y el campo amount', () => {
    const p = normalizeUsdaFood({
      ...base,
      foodNutrients: [
        { nutrientNumber: 208, amount: 100 },
        { nutrientNumber: 203, amount: 10 },
        { nutrientNumber: 204, amount: 5 },
        { nutrientNumber: 205, amount: 10 },
      ],
    });
    expect(p?.per100g.kcal).toBe(100);
  });

  it('exige fdcId entero y descripción', () => {
    expect(normalizeUsdaFood({ ...base, fdcId: 1.5 })).toBeNull();
    expect(normalizeUsdaFood({ ...base, fdcId: undefined })).toBeNull();
    expect(normalizeUsdaFood({ ...base, description: '  ' })).toBeNull();
  });

  it('rechaza lo que no es un objeto y tolera foodNutrients inválido', () => {
    expect(normalizeUsdaFood(null)).toBeNull();
    expect(normalizeUsdaFood('x')).toBeNull();
    expect(normalizeUsdaFood({ ...base, foodNutrients: 'x' })).toBeNull();
    expect(
      normalizeUsdaFood({ ...base, foodNutrients: [null, 3, ...base.foodNutrients] }),
    ).not.toBeNull();
  });
});
