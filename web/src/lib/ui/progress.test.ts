import { describe, expect, it } from 'vitest';
import { isOver, progressRatio, ringGeometry } from './progress';

describe('progressRatio', () => {
  it('calcula la fracción y la limita a 0–1', () => {
    expect(progressRatio(50, 200)).toBe(0.25);
    expect(progressRatio(200, 200)).toBe(1);
    expect(progressRatio(300, 200)).toBe(1);
    expect(progressRatio(-5, 200)).toBe(0);
    expect(progressRatio(0, 200)).toBe(0);
  });

  it('una meta inválida o valores no finitos dan 0, no NaN', () => {
    expect(progressRatio(50, 0)).toBe(0);
    expect(progressRatio(50, -10)).toBe(0);
    expect(progressRatio(Number.NaN, 100)).toBe(0);
    expect(progressRatio(50, Number.NaN)).toBe(0);
    expect(progressRatio(Number.POSITIVE_INFINITY, 100)).toBe(0);
  });
});

describe('isOver', () => {
  it('es verdadero solo al superar una meta válida', () => {
    expect(isOver(2001, 2000)).toBe(true);
    expect(isOver(2000, 2000)).toBe(false);
    expect(isOver(5, 0)).toBe(false);
    expect(isOver(Number.NaN, 100)).toBe(false);
  });
});

describe('ringGeometry', () => {
  it('calcula radio, circunferencia y desplazamiento del trazo', () => {
    const g = ringGeometry({ value: 50, max: 100, size: 120, strokeWidth: 10 });
    expect(g.radius).toBe(55);
    expect(g.circumference).toBeCloseTo(2 * Math.PI * 55, 9);
    expect(g.ratio).toBe(0.5);
    expect(g.offset).toBeCloseTo(g.circumference / 2, 9);
    expect(g.over).toBe(false);
  });

  it('vacío, lleno y excedido', () => {
    expect(ringGeometry({ value: 0, max: 100, size: 100, strokeWidth: 10 }).offset).toBeCloseTo(
      2 * Math.PI * 45,
      9,
    );
    const full = ringGeometry({ value: 150, max: 100, size: 100, strokeWidth: 10 });
    expect(full.offset).toBe(0);
    expect(full.over).toBe(true);
  });

  it('un trazo mayor que el tamaño no da radio negativo', () => {
    expect(ringGeometry({ value: 1, max: 2, size: 10, strokeWidth: 30 }).radius).toBe(0);
  });
});
