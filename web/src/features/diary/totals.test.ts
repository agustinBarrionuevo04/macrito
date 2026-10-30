import { describe, expect, it } from 'vitest';
import { groupByMeal, kcalStatus, sumSnapshots } from './totals';
import type { DiaryEntry } from './types';

const entry = (id: string, mealType: DiaryEntry['mealType'], kcal: number): DiaryEntry => ({
  id,
  mealType,
  foodId: null,
  name: id,
  quantityG: 100,
  kcal,
  protein_g: 1,
  carbs_g: 2,
  fat_g: 3,
  origin: 'manual',
  isEstimate: false,
  createdAt: '2026-03-15T12:00:00Z',
});

describe('sumSnapshots', () => {
  it('suma todos los campos', () => {
    expect(
      sumSnapshots([
        { kcal: 100, protein_g: 10, carbs_g: 5, fat_g: 2 },
        { kcal: 250.5, protein_g: 0.5, carbs_g: 20, fat_g: 7.25 },
      ]),
    ).toEqual({ kcal: 350.5, protein_g: 10.5, carbs_g: 25, fat_g: 9.25 });
  });

  it('es exacta: no arrastra el error de sumar decimales', () => {
    const tenths = Array.from({ length: 10 }, () => ({
      kcal: 0.1,
      protein_g: 0.2,
      carbs_g: 0.3,
      fat_g: 0.7,
    }));
    expect(tenths.reduce((acc, s) => acc + s.kcal, 0)).not.toBe(1); // 0.9999999999999999
    expect(sumSnapshots(tenths)).toEqual({ kcal: 1, protein_g: 2, carbs_g: 3, fat_g: 7 });
  });

  it('una lista vacía suma cero', () => {
    expect(sumSnapshots([])).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe('groupByMeal', () => {
  it('agrupa por comida conservando el orden, e incluye las comidas vacías', () => {
    const groups = groupByMeal([
      entry('a', 'lunch', 1),
      entry('b', 'breakfast', 2),
      entry('c', 'lunch', 3),
    ]);
    expect(groups.lunch.map((e) => e.id)).toEqual(['a', 'c']);
    expect(groups.breakfast.map((e) => e.id)).toEqual(['b']);
    expect(groups.dinner).toEqual([]);
    expect(groups.snack).toEqual([]);
  });
});

describe('kcalStatus', () => {
  it('calcula lo que queda', () => {
    expect(kcalStatus(2000, 1200)).toEqual({ remaining: 800, over: false });
    expect(kcalStatus(2000, 2000)).toEqual({ remaining: 0, over: false });
  });

  it('marca cuánto se pasó', () => {
    expect(kcalStatus(2000, 2150.4)).toEqual({ remaining: 150, over: true });
  });

  it('redondea a kcal enteras', () => {
    expect(kcalStatus(2112.4, 1000.2)).toEqual({ remaining: 1112, over: false });
  });
});
