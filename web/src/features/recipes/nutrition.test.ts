import { describe, expect, it } from 'vitest';
import { ingredientMacros, recipeNutrition } from './nutrition';
import type { Ingredient } from './types';

const item = (
  name: string,
  grams: number,
  k: number,
  p: number,
  c: number,
  f: number,
): Ingredient => ({
  foodId: null,
  name,
  grams,
  kcal_100g: k,
  protein_100g: p,
  carbs_100g: c,
  fat_100g: f,
});

const harina = item('Harina', 200, 364, 10, 76, 1);
const huevo = item('Huevo', 100, 143, 13, 1, 10);

describe('ingredientMacros', () => {
  it('valor por 100 g por los gramos usados', () => {
    expect(ingredientMacros(harina)).toEqual({ kcal: 728, protein_g: 20, carbs_g: 152, fat_g: 2 });
  });
});

describe('recipeNutrition', () => {
  it('suma los ingredientes y reparte por porciones (calculado a mano)', () => {
    const r = recipeNutrition([harina, huevo], 4, null);
    expect(r.totalGrams).toBe(300);
    expect(r.weightG).toBe(300);
    expect(r.totals).toEqual({ kcal: 871, protein_g: 33, carbs_g: 153, fat_g: 12 });
    // por 100 g = total / 300 g × 100
    expect(r.per100g).toEqual({ kcal: 290.33, protein_g: 11, carbs_g: 51, fat_g: 4 });
    // por porción = total / 4; cada porción pesa 300 / 4
    expect(r.perServing).toEqual({
      kcal: 217.75,
      protein_g: 8.25,
      carbs_g: 38.25,
      fat_g: 3,
      grams: 75,
    });
    expect(r.plausible).toBe(true);
  });

  it('el peso final cambia los valores por 100 g y el peso de la porción, no los totales', () => {
    const raw = recipeNutrition([harina, huevo], 4, null);
    const cooked = recipeNutrition([harina, huevo], 4, 250); // pierde agua
    expect(cooked.totals).toEqual(raw.totals);
    expect(cooked.weightG).toBe(250);
    expect(cooked.per100g.kcal).toBe(348.4); // 871 / 250 × 100
    expect(cooked.perServing.grams).toBe(62.5);
    expect(cooked.perServing.kcal).toBe(raw.perServing.kcal);
  });

  it('1 porción: la porción es toda la receta', () => {
    const r = recipeNutrition([harina], 1, null);
    expect(r.perServing).toMatchObject({ kcal: 728, grams: 200 });
  });

  it('porciones fraccionarias', () => {
    expect(recipeNutrition([harina], 2.5, null).perServing.kcal).toBe(291.2);
  });

  it('suma exacta, sin ruido de punto flotante (0,1 + 0,2)', () => {
    const r = recipeNutrition(
      [item('a', 100, 0.1, 0.1, 0, 0), item('b', 100, 0.2, 0.2, 0, 0)],
      1,
      null,
    );
    expect(r.totals.kcal).toBe(0.3);
    expect(r.totals.protein_g).toBe(0.3);
  });

  it('un peso final imposible (muy bajo) se marca como no plausible', () => {
    expect(recipeNutrition([harina, huevo], 4, 50).plausible).toBe(false); // 1.742 kcal por 100 g
  });

  it('sin ingredientes no revienta ni da NaN', () => {
    const r = recipeNutrition([], 4, null);
    expect(r.per100g).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(r.perServing.grams).toBe(0);
    expect(r.plausible).toBe(false);
  });

  it('no modifica los ingredientes recibidos', () => {
    const items = [harina, huevo];
    const copy = JSON.stringify(items);
    recipeNutrition(items, 4, null);
    expect(JSON.stringify(items)).toBe(copy);
  });
});
