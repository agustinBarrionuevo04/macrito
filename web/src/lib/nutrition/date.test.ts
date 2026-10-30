import { describe, expect, it } from 'vitest';
import { NutritionInputError } from './errors';
import { parseIsoDate, todayInTimeZone } from './date';

describe('todayInTimeZone', () => {
  it('una cena a las 23:30 en Córdoba sigue siendo el mismo día aunque en UTC ya sea el siguiente', () => {
    const instant = new Date('2026-03-15T02:30:00Z'); // 23:30 del 14 en UTC-3
    expect(todayInTimeZone('America/Argentina/Cordoba', instant)).toBe('2026-03-14');
    expect(todayInTimeZone('UTC', instant)).toBe('2026-03-15');
  });

  it('cambia de día a medianoche local', () => {
    expect(todayInTimeZone('America/Argentina/Cordoba', new Date('2026-03-15T02:59:59Z'))).toBe(
      '2026-03-14',
    );
    expect(todayInTimeZone('America/Argentina/Cordoba', new Date('2026-03-15T03:00:00Z'))).toBe(
      '2026-03-15',
    );
  });
});

describe('parseIsoDate', () => {
  it('parsea una fecha válida', () => {
    expect(parseIsoDate('2026-03-15')).toEqual({ year: 2026, month: 3, day: 15 });
  });

  it('rechaza formatos y días inexistentes', () => {
    expect(() => parseIsoDate('2026-3-15')).toThrow(NutritionInputError);
    expect(() => parseIsoDate('2026-13-01')).toThrow(NutritionInputError);
    expect(() => parseIsoDate('2026-04-31')).toThrow(NutritionInputError);
  });
});
