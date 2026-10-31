import { describe, expect, it } from 'vitest';
import { exportRecipe, importRecipe } from './exchange';
import { MAX_IMPORT_CHARS } from './schemas';

const recipe = {
  kind: 'recipe' as const,
  name: 'Tarta de verdura',
  servings: 4,
  finalWeightG: null,
  items: [
    {
      foodId: 'f1',
      name: 'Harina',
      grams: 200,
      kcal_100g: 364,
      protein_100g: 10,
      carbs_100g: 76,
      fat_100g: 1,
    },
    {
      foodId: null,
      name: 'Huevo',
      grams: 100,
      kcal_100g: 143,
      protein_100g: 13,
      carbs_100g: 1,
      fat_100g: 10,
    },
  ],
};

describe('exportRecipe / importRecipe', () => {
  it('exportar e importar devuelve lo mismo, sin ids (sirve entre cuentas)', () => {
    const text = exportRecipe(recipe);
    expect(text).not.toContain('f1');
    const result = importRecipe(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toMatchObject({
      kind: 'recipe',
      name: 'Tarta de verdura',
      servings: 4,
      finalWeightG: null,
    });
    expect(result.input.items.map((i) => i.name)).toEqual(['Harina', 'Huevo']);
    expect(result.input.items.every((i) => i.foodId === null)).toBe(true);
  });

  it('conserva el peso final y el tipo combo', () => {
    const result = importRecipe(
      exportRecipe({ ...recipe, kind: 'combo', servings: 1, finalWeightG: 280 }),
    );
    expect(result).toMatchObject({ ok: true, input: { kind: 'combo', finalWeightG: 280 } });
  });

  it('rechaza texto vacío, enorme, que no es JSON o con otro formato', () => {
    expect(importRecipe('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(importRecipe('x'.repeat(MAX_IMPORT_CHARS + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
    expect(importRecipe('esto no es json')).toEqual({ ok: false, reason: 'not_json' });
    expect(importRecipe('{"name":"x"}')).toEqual({ ok: false, reason: 'format' });
    expect(importRecipe('[1,2]')).toEqual({ ok: false, reason: 'format' });
    expect(importRecipe('{"macritos":2,"kind":"recipe","name":"x","items":[]}')).toEqual({
      ok: false,
      reason: 'format',
    });
  });

  it('valida lo importado igual que una receta nueva: nada del texto se confía', () => {
    const bad = (patch: object) =>
      importRecipe(
        JSON.stringify({
          macritos: 1,
          kind: 'recipe',
          name: 'x',
          servings: 1,
          items: [recipe.items[1]],
          ...patch,
        }),
      );
    expect(bad({ servings: 0 })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(bad({ servings: 5000 })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(bad({ name: '   ' })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(bad({ name: 'x'.repeat(101) })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(bad({ items: [] })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(bad({ items: Array.from({ length: 41 }, () => recipe.items[1]) })).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(bad({ items: [{ ...recipe.items[1], grams: -5 }] })).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(bad({ items: [{ ...recipe.items[1], kcal_100g: 99999 }] })).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(bad({ finalWeightG: 0 })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('ignora campos extra (un id inventado no se cuela)', () => {
    const text = JSON.stringify({
      macritos: 1,
      kind: 'recipe',
      name: 'x',
      user_id: 'otro',
      items: [{ ...recipe.items[1], food_id: 'robado', foodId: 'robado' }],
    });
    const result = importRecipe(text);
    expect(result.ok && result.input.items[0]?.foodId).toBeNull();
  });

  it('servings ausente cae en 1', () => {
    const text = JSON.stringify({
      macritos: 1,
      kind: 'combo',
      name: 'x',
      items: [recipe.items[1]],
    });
    expect(importRecipe(text)).toMatchObject({ ok: true, input: { servings: 1 } });
  });
});
