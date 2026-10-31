import { describe, expect, it } from 'vitest';
import { parseItems, parseRecipe, parseSummaries } from './mapping';

const recipeRow = {
  id: 'r1',
  kind: 'recipe',
  name: 'Tarta',
  servings: '4',
  final_weight_g: null,
  food_id: 'f1',
};
const item = (recipe_id: string, position: number, extra: object = {}) => ({
  recipe_id,
  position,
  food_id: null,
  name: 'Harina',
  grams: 200,
  kcal_100g: 364,
  protein_100g: 10,
  carbs_100g: 76,
  fat_100g: 1,
  ...extra,
});

describe('parseRecipe', () => {
  it('lee la fila con numéricos como texto y nulos', () => {
    expect(parseRecipe(recipeRow, [])).toEqual({
      id: 'r1',
      kind: 'recipe',
      name: 'Tarta',
      servings: 4,
      finalWeightG: null,
      foodId: 'f1',
      items: [],
    });
  });
  it('una fila ilegible da null', () => {
    expect(parseRecipe({ id: 'r1', kind: 'otro' }, [])).toBeNull();
    expect(parseRecipe(null, [])).toBeNull();
  });
});

describe('parseItems', () => {
  it('lee los ingredientes y descarta los ilegibles', () => {
    const items = parseItems([item('r1', 0), { name: 'sin gramos' }, null]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      recipeId: 'r1',
      position: 0,
      item: { name: 'Harina', grams: 200, foodId: null },
    });
    expect(parseItems('x')).toEqual([]);
  });
});

describe('parseSummaries', () => {
  it('agrupa los ingredientes por receta y calcula kcal por porción (receta) o totales (combo)', () => {
    const recipes = [
      recipeRow,
      {
        id: 'c1',
        kind: 'combo',
        name: 'Desayuno',
        servings: 1,
        final_weight_g: null,
        food_id: null,
      },
    ];
    const items = [
      item('r1', 1, { name: 'Huevo', grams: 100, kcal_100g: 143 }),
      item('r1', 0),
      item('c1', 0, { grams: 100, kcal_100g: 200 }),
    ];
    const [recipe, combo] = parseSummaries(recipes, items);
    expect(recipe).toMatchObject({ id: 'r1', itemCount: 2, kcal: 218 }); // (728 + 143) / 4
    expect(combo).toMatchObject({ id: 'c1', kind: 'combo', itemCount: 1, kcal: 200 });
  });
  it('una receta sin ingredientes y entradas inválidas no rompen', () => {
    expect(parseSummaries([recipeRow], [])[0]).toMatchObject({ itemCount: 0, kcal: 0 });
    expect(parseSummaries('x', null)).toEqual([]);
    expect(parseSummaries([{ nada: 1 }], [])).toEqual([]);
  });
});
