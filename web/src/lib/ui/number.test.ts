import { describe, expect, it } from 'vitest';
import { formatNumber, isPartialDecimal, parseDecimal } from './number';

describe('parseDecimal', () => {
  it('acepta coma y punto decimal', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal('70')).toBe(70);
    expect(parseDecimal(' 62,35 ')).toBe(62.35);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('1,')).toBe(1);
  });

  it('devuelve null si está vacío o no es un número', () => {
    for (const bad of ['', '  ', 'abc', '1,2,3', '1.2.3', '-5', '1e3', ',', '.', '1 000']) {
      expect(parseDecimal(bad), bad).toBeNull();
    }
  });
});

describe('isPartialDecimal', () => {
  it('permite teclas intermedias y rechaza letras', () => {
    for (const ok of ['', '1', '1,', ',5', '12.5', '0,0'])
      expect(isPartialDecimal(ok), ok).toBe(true);
    for (const bad of ['a', '1a', '--1', '1,2,3']) expect(isPartialDecimal(bad), bad).toBe(false);
  });
});

describe('formatNumber', () => {
  it('usa la coma decimal de es-AR y recorta decimales', () => {
    expect(formatNumber(1.5)).toBe('1,5');
    expect(formatNumber(2162.4)).toBe('2.162,4'); // miles con punto, como se lee en Argentina
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(61.96, 1)).toBe('62');
    expect(formatNumber(60.123, 2)).toBe('60,12');
    expect(formatNumber(0)).toBe('0');
  });
});
