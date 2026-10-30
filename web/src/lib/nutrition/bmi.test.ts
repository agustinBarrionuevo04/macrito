import { describe, expect, it } from 'vitest';
import { bmi, bmiCategory } from './bmi';
import { NutritionInputError } from './errors';

describe('bmi', () => {
  it('calcula kg / m²', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.857, 3);
    expect(bmi(100, 200)).toBe(25);
  });

  it('rechaza valores fuera de rango o no finitos', () => {
    expect(() => bmi(0, 170)).toThrow(NutritionInputError);
    expect(() => bmi(70, 0)).toThrow(NutritionInputError);
    expect(() => bmi(Number.NaN, 170)).toThrow(NutritionInputError);
    expect(() => bmi(70, 301)).toThrow(NutritionInputError);
  });
});

describe('bmiCategory — límites inferiores inclusivos (OMS)', () => {
  it.each([
    [18.49, 'underweight'],
    [18.5, 'normal'],
    [24.99, 'normal'],
    [25, 'preobesity'],
    [29.99, 'preobesity'],
    [30, 'obesity_1'],
    [35, 'obesity_2'],
    [39.99, 'obesity_2'],
    [40, 'obesity_3'],
  ] as const)('%s → %s', (value, expected) => {
    expect(bmiCategory(value)).toBe(expected);
  });
});
