import { describe, expect, it } from 'vitest';
import { MAX_ITEM_GRAMS, MAX_ITEMS, parseModelItems } from './schema';
import { AiError } from './types';

const ok = { query: 'milanesa', confidence: 'high' };

const bad = (raw: unknown) => {
  try {
    parseModelItems(raw);
  } catch (error) {
    return error instanceof AiError ? error.code : 'other';
  }
  return null;
};

describe('parseModelItems: respuestas bien formadas', () => {
  it('normaliza un ítem completo', () => {
    expect(
      parseModelItems({
        items: [
          {
            query: '  Milanesa   de pollo ',
            est_grams: 180,
            count: 2,
            confidence: 'med',
            per100g_guess: { kcal: 250, protein_g: 20, carbs_g: 15, fat_g: 12 },
          },
        ],
      }),
    ).toEqual([
      {
        query: 'Milanesa de pollo',
        est_grams: 180,
        count: 2,
        confidence: 'med',
        per100g_guess: { kcal: 250, protein_g: 20, carbs_g: 15, fat_g: 12 },
      },
    ]);
  });

  it('una lista vacía es válida: no hay comida', () => {
    expect(parseModelItems({ items: [] })).toEqual([]);
  });

  it('sin gramos queda null (la persona los completa)', () => {
    expect(parseModelItems({ items: [ok] })).toEqual([
      { query: 'milanesa', est_grams: null, confidence: 'high' },
    ]);
  });

  it('acepta números como texto, con coma decimal', () => {
    expect(
      parseModelItems({ items: [{ ...ok, est_grams: '150,5', count: '3' }] })[0],
    ).toMatchObject({
      est_grams: 150.5,
      count: 3,
    });
  });

  it('ignora campos que no están en el contrato (calorías inventadas, etc.)', () => {
    const [item] = parseModelItems({
      items: [{ ...ok, kcal: 9999, calories: 5, protein: 1, extra: {} }],
    });
    expect(item).toEqual({ query: 'milanesa', est_grams: null, confidence: 'high' });
  });

  it('una confianza inválida o ausente queda en "low"', () => {
    expect(
      parseModelItems({ items: [{ query: 'a1', confidence: 'altísima' }] })[0]?.confidence,
    ).toBe('low');
    expect(parseModelItems({ items: [{ query: 'a1' }] })[0]?.confidence).toBe('low');
  });

  it('limita la cantidad de ítems', () => {
    const items = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => ({
      ...ok,
      query: `comida ${i}`,
    }));
    expect(parseModelItems({ items })).toHaveLength(MAX_ITEMS);
  });
});

describe('parseModelItems: unidades (errores ×1000)', () => {
  const grams = (extra: Record<string, unknown>) =>
    parseModelItems({ items: [{ ...ok, ...extra }] })[0]?.est_grams;

  it('convierte la cantidad escrita a gramos según la unidad declarada', () => {
    expect(grams({ amount: 1.5, unit: 'l' })).toBe(1500); // litros NO se leen como ml
    expect(grams({ amount: 1.5, unit: 'ml' })).toBe(1.5);
    expect(grams({ amount: 0.25, unit: 'kg' })).toBe(250);
    expect(grams({ amount: 200, unit: 'g' })).toBe(200);
    expect(grams({ amount: 2, unit: 'oz' })).toBe(56.7);
    expect(grams({ amount: 1, unit: 'lb' })).toBe(453.59);
  });

  it('la cantidad con unidad manda sobre est_grams', () => {
    expect(grams({ amount: 2, unit: 'kg', est_grams: 5 })).toBe(2000);
  });

  it('una unidad desconocida no se usa: cae en est_grams', () => {
    expect(grams({ amount: 3, unit: 'cucharadas', est_grams: 45 })).toBe(45);
    expect(grams({ amount: 3, unit: 'cucharadas' })).toBeNull();
  });

  it('descarta gramos imposibles (más del tope) en vez de confiar en ellos', () => {
    expect(grams({ est_grams: MAX_ITEM_GRAMS })).toBe(MAX_ITEM_GRAMS);
    expect(grams({ est_grams: MAX_ITEM_GRAMS + 1 })).toBeNull();
    expect(grams({ amount: 10, unit: 'kg' })).toBeNull();
  });

  it('descarta gramos no positivos o no numéricos', () => {
    for (const est_grams of [0, -50, Number.NaN, Infinity, 'mucho', null, {}]) {
      expect(grams({ est_grams }), String(est_grams)).toBeNull();
    }
  });
});

describe('parseModelItems: conteos', () => {
  const count = (value: unknown) => parseModelItems({ items: [{ ...ok, count: value }] })[0]?.count;

  it('solo enteros entre 1 y 50', () => {
    expect(count(1)).toBe(1);
    expect(count(50)).toBe(50);
    for (const bad of [0, -1, 51, 1.5, 'dos', null, Number.NaN])
      expect(count(bad), String(bad)).toBeUndefined();
  });
});

describe('parseModelItems: macros sugeridos', () => {
  const guess = (g: unknown) =>
    parseModelItems({ items: [{ ...ok, per100g_guess: g }] })[0]?.per100g_guess;

  it('acepta valores plausibles y coherentes con Atwater', () => {
    expect(guess({ kcal: 250, protein_g: 20, carbs_g: 15, fat_g: 12 })).toBeDefined();
    expect(guess({ kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100 })).toBeDefined();
  });

  it('descarta valores imposibles o que no cierran', () => {
    expect(guess({ kcal: 1500, protein_g: 0, carbs_g: 0, fat_g: 100 })).toBeUndefined(); // kcal > 900
    expect(guess({ kcal: 100, protein_g: 150, carbs_g: 0, fat_g: 0 })).toBeUndefined(); // macro > 100
    expect(guess({ kcal: -5, protein_g: 1, carbs_g: 1, fat_g: 1 })).toBeUndefined();
    expect(guess({ kcal: 500, protein_g: 1, carbs_g: 1, fat_g: 1 })).toBeUndefined(); // no cierra con los macros
    expect(guess({ kcal: 200, protein_g: 'x', carbs_g: 1, fat_g: 1 })).toBeUndefined();
    expect(guess({ kcal: 200 })).toBeUndefined();
    expect(guess('mucho')).toBeUndefined();
  });

  it('un macro sugerido inválido no tira el ítem', () => {
    const [item] = parseModelItems({ items: [{ ...ok, per100g_guess: { kcal: 5000 } }] });
    expect(item?.query).toBe('milanesa');
    expect(item?.per100g_guess).toBeUndefined();
  });
});

describe('parseModelItems: respuestas malformadas', () => {
  it('sin lista de ítems es un error de respuesta', () => {
    for (const raw of [
      null,
      undefined,
      'hola',
      42,
      [],
      {},
      { items: 'x' },
      { items: {} },
      { item: [ok] },
    ]) {
      expect(bad(raw), JSON.stringify(raw)).toBe('bad_response');
    }
  });

  it('si había ítems y no sobrevivió ninguno, es un error (no "no hay comida")', () => {
    expect(bad({ items: [{ name: 'huevo' }] })).toBe('bad_response');
    expect(
      bad({ items: [null, 3, 'x', [], { query: 5 }, { query: '   ' }, { query: 'x'.repeat(81) }] }),
    ).toBe('bad_response');
  });

  it('descarta los ítems rotos pero conserva los buenos', () => {
    expect(parseModelItems({ items: [null, { query: 7 }, ok, 'x'] })).toHaveLength(1);
  });
});
