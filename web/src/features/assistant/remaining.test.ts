import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '@/features/diary/types';
import type { MealType } from '@/types';
import { mealsToPlan, remainingFor } from './remaining';

const entry = (
  mealType: MealType,
  kcal: number,
  protein_g = 0,
  carbs_g = 0,
  fat_g = 0,
): DiaryEntry => ({
  id: `${mealType}-${kcal}`,
  mealType,
  foodId: null,
  name: 'x',
  quantityG: 100,
  origin: 'search',
  isEstimate: false,
  createdAt: '2026-03-15T12:00:00Z',
  kcal,
  protein_g,
  carbs_g,
  fat_g,
});

const targets = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 };

describe('remainingFor', () => {
  it('resta lo consumido de la meta', () => {
    expect(remainingFor(targets, [entry('lunch', 700.55, 40.2, 60, 25.1)])).toEqual({
      kcal: 1299.5,
      protein_g: 109.8,
      carbs_g: 140,
      fat_g: 34.9,
    });
  });
  it('sin entradas falta toda la meta', () => {
    expect(remainingFor(targets, [])).toEqual(targets);
  });
  it('un macro ya cumplido o pasado queda en 0, nunca negativo', () => {
    const result = remainingFor(targets, [entry('dinner', 2500, 200, 100, 80)]);
    expect(result).toEqual({ kcal: 0, protein_g: 0, carbs_g: 100, fat_g: 0 });
  });
});

describe('mealsToPlan', () => {
  it('son las comidas todavía vacías, en orden del día', () => {
    expect(mealsToPlan([])).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(mealsToPlan([entry('breakfast', 300), entry('lunch', 600)])).toEqual([
      'snack',
      'dinner',
    ]);
  });
  it('si todas tienen algo, queda la cena', () => {
    const all = (['breakfast', 'lunch', 'snack', 'dinner'] as const).map((meal) =>
      entry(meal, 100),
    );
    expect(mealsToPlan(all)).toEqual(['dinner']);
  });
});
