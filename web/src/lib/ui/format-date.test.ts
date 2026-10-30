import { describe, expect, it } from 'vitest';
import { formatIsoDate, formatShortDate } from './format-date';

describe('formatIsoDate', () => {
  it('da vuelta a día/mes/año', () => {
    expect(formatIsoDate('2026-03-15')).toBe('15/03/2026');
    expect(formatIsoDate('2026-01-05')).toBe('05/01/2026');
  });

  it('no cambia el día según la zona horaria del proceso', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/Argentina/Cordoba';
    expect(formatIsoDate('2026-03-15')).toBe('15/03/2026');
    process.env.TZ = original;
  });

  it('devuelve tal cual lo que no tiene el formato', () => {
    expect(formatIsoDate('hoy')).toBe('hoy');
    expect(formatIsoDate('2026-3-5')).toBe('2026-3-5');
    expect(formatIsoDate('')).toBe('');
  });
});

describe('formatShortDate', () => {
  it('día/mes sin ceros ni año', () => {
    expect(formatShortDate('2026-03-05')).toBe('5/3');
    expect(formatShortDate('2026-12-25')).toBe('25/12');
  });
  it('un texto que no es fecha queda igual', () => {
    expect(formatShortDate('hoy')).toBe('hoy');
  });
});
