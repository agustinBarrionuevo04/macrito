import { describe, expect, it } from 'vitest';
import { isAiUnit, toGrams } from './units';

describe('toGrams', () => {
  it('convierte cada unidad', () => {
    expect(toGrams(2, 'g')).toBe(2);
    expect(toGrams(1.5, 'kg')).toBe(1500);
    expect(toGrams(1.5, 'l')).toBe(1500);
    expect(toGrams(330, 'ml')).toBe(330);
    expect(toGrams(1, 'oz')).toBe(28.35);
    expect(toGrams(1, 'lb')).toBe(453.59);
  });
});

describe('isAiUnit', () => {
  it('acepta solo las unidades permitidas', () => {
    expect(isAiUnit('ml')).toBe(true);
    for (const bad of ['cup', 'ML', '', 1, null, undefined]) expect(isAiUnit(bad)).toBe(false);
  });
});
