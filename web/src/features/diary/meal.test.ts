import { describe, expect, it } from 'vitest';
import { defaultMealFor, isMealType } from './meal';

const at = (hour: number, minute = 0) => new Date(2026, 2, 15, hour, minute);

describe('defaultMealFor', () => {
  it('sugiere la comida según la hora, con sus bordes', () => {
    expect(defaultMealFor(at(0))).toBe('breakfast');
    expect(defaultMealFor(at(10, 59))).toBe('breakfast');
    expect(defaultMealFor(at(11))).toBe('lunch');
    expect(defaultMealFor(at(15, 59))).toBe('lunch');
    expect(defaultMealFor(at(16))).toBe('snack');
    expect(defaultMealFor(at(19, 59))).toBe('snack');
    expect(defaultMealFor(at(20))).toBe('dinner');
    expect(defaultMealFor(at(23, 59))).toBe('dinner');
  });
});

describe('isMealType', () => {
  it('acepta solo las cuatro comidas', () => {
    for (const meal of ['breakfast', 'lunch', 'snack', 'dinner'])
      expect(isMealType(meal)).toBe(true);
    for (const bad of ['brunch', '', undefined, null, 3, ['lunch']])
      expect(isMealType(bad)).toBe(false);
  });
});
