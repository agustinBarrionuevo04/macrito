import { describe, expect, it, vi } from 'vitest';
import type { Food } from '@/types';
import { OVERSHOOT_MARGIN_KCAL, OVERSHOOT_RATIO, resolvePlan, type SearchFoods } from './resolve';
import type { RawPlanOption } from './types';

const food = (
  id: string,
  name: string,
  kcal: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
): Food => ({
  id,
  source: 'ar_seed',
  name,
  per100g: { kcal, protein_g, carbs_g, fat_g },
  portions: [],
});

const CATALOG = [
  food('f-pollo', 'Pechuga de pollo', 165, 31, 0, 3.6),
  food('f-arroz', 'Arroz blanco cocido', 130, 2.7, 28, 0.3),
  food('f-lechuga', 'Lechuga', 15, 1.4, 2.9, 0.2),
];

const search: SearchFoods = async (query) =>
  CATALOG.filter((f) => f.name.toLowerCase().includes(query.toLowerCase().split(' ')[0]!));

const raw = (
  title: string,
  meal: RawPlanOption['meal'],
  ...items: [string, number][]
): RawPlanOption => ({
  title,
  meal,
  items: items.map(([query, grams]) => ({ query, grams })),
});

const remaining = { kcal: 700, protein_g: 50, carbs_g: 60, fat_g: 20 };

describe('resolvePlan', () => {
  it('calcula la nutrición desde los valores por 100 g de la base (150 g de pollo = 247,5 kcal)', async () => {
    const [option] = await resolvePlan(
      [raw('Pollo con arroz', 'dinner', ['pechuga de pollo', 150], ['arroz blanco cocido', 200])],
      search,
      { mode: 'meal', meals: ['dinner'], remaining },
    );
    expect(option!.items.map((i) => [i.food.id, i.grams, i.nutrition.kcal])).toEqual([
      ['f-pollo', 150, 247.5],
      ['f-arroz', 200, 260],
    ]);
    expect(option!.totals).toEqual({ kcal: 507.5, protein_g: 51.9, carbs_g: 56, fat_g: 6 });
  });

  it('busca cada nombre una sola vez aunque se repita entre opciones', async () => {
    const spy = vi.fn(search);
    await resolvePlan(
      [
        raw('A', 'dinner', ['pechuga de pollo', 100]),
        raw('B', 'dinner', ['pechuga de pollo', 120], ['lechuga', 50]),
      ],
      spy,
      { mode: 'meal', meals: ['dinner'], remaining },
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('descarta la opción entera si un alimento no está en la base (no subestima sus calorías)', async () => {
    const options = await resolvePlan(
      [
        raw('Con unicornio', 'dinner', ['pechuga de pollo', 100], ['carne de unicornio', 100]),
        raw('Sana', 'dinner', ['lechuga', 100]),
      ],
      search,
      { mode: 'meal', meals: ['dinner'], remaining },
    );
    expect(options.map((o) => o.title)).toEqual(['Sana']);
  });

  it('en modo comida descarta lo que se pasa de lo que falta; el límite exacto entra', async () => {
    const limit = remaining.kcal * OVERSHOOT_RATIO + OVERSHOOT_MARGIN_KCAL; // 925
    const gramsAtLimit = (limit / 165) * 100;
    const ok = await resolvePlan(
      [raw('Justo', 'dinner', ['pechuga de pollo', gramsAtLimit - 1])],
      search,
      {
        mode: 'meal',
        meals: ['dinner'],
        remaining,
      },
    );
    const over = await resolvePlan(
      [raw('Pasado', 'dinner', ['pechuga de pollo', gramsAtLimit + 5])],
      search,
      {
        mode: 'meal',
        meals: ['dinner'],
        remaining,
      },
    );
    expect(ok).toHaveLength(1);
    expect(over).toHaveLength(0);
  });

  it('en modo comida todas las opciones van a la comida pedida, diga lo que diga el modelo', async () => {
    const options = await resolvePlan(
      [raw('A', 'breakfast', ['lechuga', 100]), raw('B', null, ['lechuga', 100])],
      search,
      { mode: 'meal', meals: ['lunch'], remaining },
    );
    expect(options.map((o) => o.meal)).toEqual(['lunch', 'lunch']);
  });

  it('en modo día respeta la comida del modelo si es libre y reparte el resto; sobran las que no caben', async () => {
    const options = await resolvePlan(
      [
        raw('Cena', 'dinner', ['lechuga', 100]),
        raw('Otra cena', 'dinner', ['lechuga', 100]),
        raw('Sin comida', null, ['lechuga', 100]),
        raw('Extra', null, ['lechuga', 100]),
      ],
      search,
      { mode: 'day', meals: ['lunch', 'dinner'], remaining },
    );
    expect(options.map((o) => [o.title, o.meal])).toEqual([
      ['Cena', 'dinner'],
      ['Otra cena', 'lunch'],
    ]);
  });

  it('en modo día no descarta por calorías (el total se muestra contra lo que falta)', async () => {
    const options = await resolvePlan(
      [raw('Enorme', 'dinner', ['pechuga de pollo', 2000])],
      search,
      {
        mode: 'day',
        meals: ['dinner'],
        remaining,
      },
    );
    expect(options).toHaveLength(1);
  });

  it('un error de la búsqueda se propaga (no se confunde con "no encontrado")', async () => {
    const failing: SearchFoods = async () => {
      throw new Error('base caída');
    };
    await expect(
      resolvePlan([raw('A', 'dinner', ['lechuga', 100])], failing, {
        mode: 'meal',
        meals: ['dinner'],
        remaining,
      }),
    ).rejects.toThrow('base caída');
  });
});
