import { isPlausible, round2 } from '@/lib/foods/nutrition-check';
import type { Ingredient } from './types';

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type RecipeNutrition = {
  /** Suma de los gramos de los ingredientes. */
  totalGrams: number;
  /** Peso con el que se reparte: el peso final si se informó, si no la suma de los ingredientes. */
  weightG: number;
  totals: Macros;
  per100g: Macros;
  /** Una porción: su peso y sus valores. */
  perServing: Macros & { grams: number };
  /** `false` si los valores por 100 g son imposibles (por ejemplo, un peso final demasiado chico). */
  plausible: boolean;
};

const cents = (value: number) => Math.round(value * 100);

/** Aporte de un ingrediente: su valor por 100 g por los gramos usados. */
export function ingredientMacros(item: Ingredient): Macros {
  const factor = item.grams / 100;
  return {
    kcal: item.kcal_100g * factor,
    protein_g: item.protein_100g * factor,
    carbs_g: item.carbs_100g * factor,
    fat_g: item.fat_100g * factor,
  };
}

/**
 * Valores de una receta a partir de sus ingredientes. Los totales se suman en centésimas enteras (sin
 * ruido de punto flotante). Los valores por 100 g dividen por el peso final si se informó (cocinar
 * pierde o gana agua) y, si no, por la suma de los ingredientes en crudo.
 */
export function recipeNutrition(
  items: readonly Ingredient[],
  servings: number,
  finalWeightG: number | null,
): RecipeNutrition {
  const sums = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  let totalGrams = 0;
  for (const item of items) {
    const macros = ingredientMacros(item);
    sums.kcal += cents(macros.kcal);
    sums.protein_g += cents(macros.protein_g);
    sums.carbs_g += cents(macros.carbs_g);
    sums.fat_g += cents(macros.fat_g);
    totalGrams += item.grams;
  }
  const totals: Macros = {
    kcal: sums.kcal / 100,
    protein_g: sums.protein_g / 100,
    carbs_g: sums.carbs_g / 100,
    fat_g: sums.fat_g / 100,
  };
  const weightG = finalWeightG ?? totalGrams;
  const per = (value: number, divisor: number) => (divisor > 0 ? round2(value / divisor) : 0);

  const per100g: Macros = {
    kcal: per(totals.kcal * 100, weightG),
    protein_g: per(totals.protein_g * 100, weightG),
    carbs_g: per(totals.carbs_g * 100, weightG),
    fat_g: per(totals.fat_g * 100, weightG),
  };
  return {
    totalGrams: round2(totalGrams),
    weightG: round2(weightG),
    totals,
    per100g,
    perServing: {
      kcal: per(totals.kcal, servings),
      protein_g: per(totals.protein_g, servings),
      carbs_g: per(totals.carbs_g, servings),
      fat_g: per(totals.fat_g, servings),
      grams: per(weightG, servings),
    },
    plausible: weightG > 0 && isPlausible(per100g),
  };
}

/** La porción que se le agrega al alimento de la receta. */
export const SERVING_LABEL = '1 porción';
