import { describe, expect, it } from 'vitest';
import { assertSupportedAge, calcAge } from './age';
import { NutritionInputError } from './errors';

describe('calcAge', () => {
  it('cumple años el día exacto', () => {
    expect(calcAge('1996-03-15', '2026-03-14')).toBe(29);
    expect(calcAge('1996-03-15', '2026-03-15')).toBe(30);
    expect(calcAge('1996-03-15', '2026-03-16')).toBe(30);
  });

  it('compara mes antes que día', () => {
    expect(calcAge('2000-12-31', '2026-01-01')).toBe(25);
    expect(calcAge('2000-01-31', '2026-02-01')).toBe(26);
  });

  it('no deriva por años bisiestos (el cálculo por días/365 sí)', () => {
    // 30 años a partir del 2000-01-01 incluyen 8 bisiestos: días/365 daría 30 ocho días antes.
    expect(calcAge('1996-01-01', '2025-12-24')).toBe(29);
    expect(calcAge('1996-01-01', '2026-01-01')).toBe(30);
  });

  it('nacido un 29 de febrero cumple el 1 de marzo en años no bisiestos', () => {
    expect(calcAge('2000-02-29', '2026-02-28')).toBe(25);
    expect(calcAge('2000-02-29', '2026-03-01')).toBe(26);
    expect(calcAge('2000-02-29', '2028-02-29')).toBe(28);
  });

  it('devuelve 0 para un recién nacido', () => {
    expect(calcAge('2026-03-01', '2026-03-01')).toBe(0);
  });

  it('rechaza fechas futuras, inexistentes o mal formadas', () => {
    expect(() => calcAge('2030-01-01', '2026-01-01')).toThrow(NutritionInputError);
    expect(() => calcAge('2026-02-30', '2026-03-01')).toThrow(NutritionInputError);
    expect(() => calcAge('2001-02-29', '2026-03-01')).toThrow(NutritionInputError);
    expect(() => calcAge('15/03/1996', '2026-03-01')).toThrow(NutritionInputError);
    expect(() => calcAge('1996-03-15', 'hoy')).toThrow(NutritionInputError);
  });
});

describe('assertSupportedAge', () => {
  it('acepta de 13 a 130 años inclusive', () => {
    expect(() => assertSupportedAge(13)).not.toThrow();
    expect(() => assertSupportedAge(130)).not.toThrow();
  });

  it('rechaza fuera de rango', () => {
    expect(() => assertSupportedAge(12)).toThrow(NutritionInputError);
    expect(() => assertSupportedAge(131)).toThrow(NutritionInputError);
    expect(() => assertSupportedAge(Number.NaN)).toThrow(NutritionInputError);
  });
});
