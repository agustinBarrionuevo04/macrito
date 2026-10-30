import { describe, expect, it, vi } from 'vitest';
import type { Food, PhotoItem } from '@/types';
import { initialGrams, pickMatch, resolveItems } from './resolve';

const food = (name: string, extra: Partial<Food> = {}): Food => ({
  id: name,
  source: 'ar_seed',
  name,
  per100g: { kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 3 },
  portions: [],
  ...extra,
});

describe('pickMatch', () => {
  it('encuentra por palabras, ignorando acentos, mayúsculas, plurales y conectores', () => {
    expect(pickMatch('milanesas de pollo', [food('Milanesa de pollo')])?.name).toBe(
      'Milanesa de pollo',
    );
    expect(pickMatch('PURÉ de papa', [food('Pure de papas')])?.name).toBe('Pure de papas');
    expect(pickMatch('dulce de leche', [food('Dulce de leche clásico')])).not.toBeNull();
  });

  it('respeta el orden de la búsqueda (el primero que cumple)', () => {
    const list = [food('Milanesa de carne'), food('Milanesa de pollo')];
    expect(pickMatch('milanesa', list)?.name).toBe('Milanesa de carne');
  });

  it('exige que aparezca casi toda la consulta (60 %)', () => {
    // "milanesa de pollo" → 2 palabras útiles: con una sola no alcanza (50 %).
    expect(pickMatch('milanesa de pollo', [food('Milanesa de carne')])).toBeNull();
    // 3 palabras: con 2 alcanza (67 %).
    expect(pickMatch('arroz con pollo grande', [food('Arroz con pollo')])).not.toBeNull();
  });

  it('un alimento distinto no es un match', () => {
    expect(pickMatch('coca cola', [food('Leche entera'), food('Cola de pescado')])).toBeNull();
    expect(pickMatch('empanada', [food('Empanadas de humita')])).not.toBeNull();
  });

  it('también mira la marca', () => {
    expect(pickMatch('alfajor havanna', [food('Alfajor', { brand: 'Havanna' })])).not.toBeNull();
  });

  it('consultas vacías o solo conectores no matchean', () => {
    expect(pickMatch('', [food('Pan')])).toBeNull();
    expect(pickMatch('de la', [food('Pan de la casa')])).toBeNull();
    expect(pickMatch('pan', [])).toBeNull();
  });
});

describe('initialGrams', () => {
  const item = (extra: Partial<PhotoItem> = {}): PhotoItem => ({
    query: 'x',
    est_grams: null,
    confidence: 'med',
    ...extra,
  });
  const withPortion = food('Huevo', { portions: [{ label: '1 unidad', grams: 50 }] });

  it('usa los gramos que estimó el modelo', () => {
    expect(initialGrams(item({ est_grams: 180, count: 2 }), withPortion)).toBe(180);
  });

  it('sin estimación, cantidad × primera porción del alimento', () => {
    expect(initialGrams(item({ count: 3 }), withPortion)).toBe(150);
    expect(initialGrams(item(), withPortion)).toBe(50);
  });

  it('sin estimación ni porciones queda null (la persona la completa)', () => {
    expect(initialGrams(item({ count: 2 }), food('Arroz'))).toBeNull();
    expect(initialGrams(item(), null)).toBeNull();
  });
});

describe('resolveItems', () => {
  const items: PhotoItem[] = [
    { query: 'milanesa', est_grams: 150, confidence: 'high' },
    {
      query: 'budín de zapallo',
      est_grams: 100,
      confidence: 'low',
      per100g_guess: { kcal: 200, protein_g: 4, carbs_g: 30, fat_g: 7 },
    },
    { query: 'flan raro', est_grams: null, confidence: 'low' },
  ];

  it('mantiene el orden, usa la base si hay match y el valor sugerido solo si no', async () => {
    const search = vi.fn(async (query: string) => ({
      foods: query === 'milanesa' ? [food('Milanesa de carne')] : [],
    }));
    const result = await resolveItems(items, search);
    expect(result.map((r) => r.query)).toEqual(['milanesa', 'budín de zapallo', 'flan raro']);
    expect(result[0]).toMatchObject({
      food: { name: 'Milanesa de carne' },
      guess: null,
      grams: 150,
    });
    expect(result[1]).toMatchObject({
      food: null,
      guess: { kcal: 200, protein_g: 4, carbs_g: 30, fat_g: 7 },
      grams: 100,
    });
    expect(result[2]).toMatchObject({ food: null, guess: null, grams: null });
  });

  it('un match de la base descarta lo que sugería el modelo (la nutrición sale de la base)', async () => {
    const result = await resolveItems(
      [
        {
          query: 'pan',
          est_grams: 50,
          confidence: 'high',
          per100g_guess: { kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0 },
        },
      ],
      async () => ({ foods: [food('Pan')] }),
    );
    expect(result[0]?.guess).toBeNull();
    expect(result[0]?.food?.per100g.kcal).toBe(100);
  });

  it('si la búsqueda de un ítem falla, queda sin alimento y los demás siguen', async () => {
    const search = vi.fn(async (query: string) => {
      if (query === 'milanesa') throw new Error('503');
      return { foods: [] };
    });
    const result = await resolveItems(items, search);
    expect(result[0]).toMatchObject({ food: null });
    expect(result).toHaveLength(3);
  });

  it('limita la concurrencia', async () => {
    let active = 0;
    let peak = 0;
    const search = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { foods: [] };
    };
    await resolveItems(
      Array.from({ length: 8 }, (_, i) => ({
        query: `comida ${i}`,
        est_grams: 10,
        confidence: 'med' as const,
      })),
      search,
      { concurrency: 2 },
    );
    expect(peak).toBe(2);
  });

  it('una lista vacía no busca nada', async () => {
    const search = vi.fn();
    expect(await resolveItems([], search)).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it('si se cancela, propaga el error de la búsqueda', async () => {
    const controller = new AbortController();
    const search = async () => {
      controller.abort();
      throw new DOMException('x', 'AbortError');
    };
    await expect(resolveItems(items, search, { signal: controller.signal })).rejects.toBeDefined();
  });
});
