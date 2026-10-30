import { afterEach, describe, expect, it } from 'vitest';
import { addDays, dayLabel, isValidDay, resolveDay } from './dates';

describe('isValidDay', () => {
  it('acepta fechas reales entre 2000 y 2100', () => {
    expect(isValidDay('2026-03-15')).toBe(true);
    expect(isValidDay('2024-02-29')).toBe(true);
    expect(isValidDay('2000-01-01')).toBe(true);
    expect(isValidDay('2100-12-31')).toBe(true);
  });

  it('rechaza inexistentes, mal formadas, fuera de rango y no-strings', () => {
    for (const bad of [
      '2026-02-30',
      '2025-02-29',
      '2026-13-01',
      '15/03/2026',
      '2026-3-5',
      '1999-12-31',
      '2101-01-01',
      '',
      'hoy',
    ]) {
      expect(isValidDay(bad), bad).toBe(false);
    }
    for (const bad of [null, undefined, 20260315, {}, []]) expect(isValidDay(bad)).toBe(false);
  });
});

describe('addDays', () => {
  it('suma y resta días, cruzando meses y años', () => {
    expect(addDays('2026-03-15', 1)).toBe('2026-03-16');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-03-15', 0)).toBe('2026-03-15');
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02');
  });

  it('respeta los años bisiestos', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('no depende de la zona horaria del proceso (incluidos los cambios de horario)', () => {
    const original = process.env.TZ;
    afterEach(() => {
      process.env.TZ = original;
    });
    for (const tz of ['America/Argentina/Cordoba', 'America/New_York', 'Pacific/Auckland', 'UTC']) {
      process.env.TZ = tz;
      expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // día del cambio de horario en EE.UU.
      expect(addDays('2026-03-15', -1)).toBe('2026-03-14');
    }
  });

  it('lanza si la fecha no es válida', () => {
    expect(() => addDays('basura', 1)).toThrow();
  });
});

describe('dayLabel', () => {
  const today = '2026-03-15';

  it('hoy, ayer y mañana', () => {
    expect(dayLabel('2026-03-15', today)).toEqual({ kind: 'today' });
    expect(dayLabel('2026-03-14', today)).toEqual({ kind: 'yesterday' });
    expect(dayLabel('2026-03-16', today)).toEqual({ kind: 'tomorrow' });
  });

  it('el resto, con día de la semana en español', () => {
    expect(dayLabel('2026-03-10', today)).toEqual({ kind: 'date', text: 'martes, 10 de marzo' });
    expect(dayLabel('2026-01-01', today)).toEqual({ kind: 'date', text: 'jueves, 1 de enero' });
  });

  it('ayer es ayer también cruzando el mes', () => {
    expect(dayLabel('2026-02-28', '2026-03-01')).toEqual({ kind: 'yesterday' });
  });
});

describe('resolveDay', () => {
  const today = '2026-03-15';

  it('usa la fecha pedida si es válida y no es futura', () => {
    expect(resolveDay('2026-03-10', today)).toBe('2026-03-10');
    expect(resolveDay('2026-03-15', today)).toBe('2026-03-15');
  });

  it('cae en hoy si falta, es inválida o es futura', () => {
    for (const bad of [undefined, '', 'hoy', '2026-02-30', '2026-03-16', '1999-01-01']) {
      expect(resolveDay(bad, today), String(bad)).toBe(today);
    }
  });
});
