import { describe, expect, it } from 'vitest';
import type { Food } from '@/types';
import {
  buildDraft,
  defaultSelection,
  portionText,
  previewNutrition,
  totalGrams,
  unitGrams,
} from './portions';

const food = (portions: Food['portions'] = []): Food => ({
  id: 'f1',
  source: 'off',
  name: 'Pan',
  per100g: { kcal: 250, protein_g: 8, carbs_g: 50, fat_g: 2 },
  portions,
});

const withSlice = food([
  { label: '1 rebanada', grams: 30 },
  { label: '1 pan chico', grams: 60 },
]);

describe('totalGrams', () => {
  it('en gramos es la cantidad tal cual', () => {
    expect(totalGrams(food(), { kind: 'g' }, 150)).toBe(150);
  });

  it('con porciones multiplica por los gramos de la porción elegida', () => {
    expect(totalGrams(withSlice, { kind: 'portion', index: 0 }, 2)).toBe(60);
    expect(totalGrams(withSlice, { kind: 'portion', index: 1 }, 1.5)).toBe(90);
  });

  it('redondea a 2 decimales', () => {
    expect(totalGrams(withSlice, { kind: 'portion', index: 0 }, 1 / 3)).toBe(10);
    expect(
      totalGrams(food([{ label: 'x', grams: 33.333 }]), { kind: 'portion', index: 0 }, 1),
    ).toBe(33.33);
  });

  it('devuelve null para cantidades vacías, cero, negativas, NaN o excesivas', () => {
    for (const amount of [null, 0, -1, Number.NaN, Infinity, 10_001]) {
      expect(totalGrams(food(), { kind: 'g' }, amount), String(amount)).toBeNull();
    }
    expect(totalGrams(food(), { kind: 'g' }, 10_000)).toBe(10_000);
  });

  it('una porción que se sale de rango por multiplicar también es inválida', () => {
    expect(totalGrams(withSlice, { kind: 'portion', index: 1 }, 200)).toBeNull();
  });
});

describe('unitGrams', () => {
  it('gramos vale 1; una porción inexistente cae en 1 en vez de NaN', () => {
    expect(unitGrams(food(), { kind: 'g' })).toBe(1);
    expect(unitGrams(withSlice, { kind: 'portion', index: 9 })).toBe(1);
  });
});

describe('defaultSelection', () => {
  it('sin porciones: 100 g; con porciones: una de la primera', () => {
    expect(defaultSelection(food())).toEqual({ unit: { kind: 'g' }, amount: 100 });
    expect(defaultSelection(withSlice)).toEqual({ unit: { kind: 'portion', index: 0 }, amount: 1 });
  });
});

describe('previewNutrition', () => {
  it('calcula igual que el servidor (por 100 g)', () => {
    expect(previewNutrition(food(), 60)).toEqual({
      kcal: 150,
      protein_g: 4.8,
      carbs_g: 30,
      fat_g: 1.2,
    });
  });
});

describe('buildDraft', () => {
  it('arma el borrador del contrato: no es estimación', () => {
    expect(buildDraft({ food: food(), grams: 60, meal: 'snack', origin: 'barcode' })).toEqual({
      food: food(),
      quantity_g: 60,
      meal_type: 'snack',
      origin: 'barcode',
      is_estimate: false,
    });
  });
});

describe('portionText', () => {
  it('muestra la descripción y los gramos sin ruido decimal', () => {
    expect(portionText({ label: '1 rebanada', grams: 30 })).toBe('1 rebanada (30 g)');
    expect(portionText({ label: 'x', grams: 33.3333 })).toBe('x (33.33 g)');
  });
});
