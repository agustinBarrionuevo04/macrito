import { describe, expect, it } from 'vitest';
import { resolveWaterGoalMl, suggestedWaterGoalMl } from './goal';

describe('suggestedWaterGoalMl', () => {
  it('35 ml por kilo, redondeado a 100 ml', () => {
    expect(suggestedWaterGoalMl(70)).toBe(2500); // 2.450 → 2.500
    expect(suggestedWaterGoalMl(80)).toBe(2800);
    expect(suggestedWaterGoalMl(62.5)).toBe(2200); // 2.187,5
  });
  it('entre 1,5 y 4 litros', () => {
    expect(suggestedWaterGoalMl(30)).toBe(1500);
    expect(suggestedWaterGoalMl(200)).toBe(4000);
  });
  it('un peso inválido da el mínimo', () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) expect(suggestedWaterGoalMl(bad)).toBe(1500);
  });
});

describe('resolveWaterGoalMl', () => {
  it('usa la meta propia si es válida', () => {
    expect(resolveWaterGoalMl(3000, 80)).toEqual({ goalMl: 3000, custom: true });
    expect(resolveWaterGoalMl(500, 80)).toEqual({ goalMl: 500, custom: true });
    expect(resolveWaterGoalMl(10_000, 80)).toEqual({ goalMl: 10_000, custom: true });
  });
  it('sin meta propia o inválida cae en la sugerida', () => {
    for (const bad of [null, undefined, 499, 10_001, 2500.5, Number.NaN]) {
      expect(resolveWaterGoalMl(bad, 80), String(bad)).toEqual({ goalMl: 2800, custom: false });
    }
  });
});
