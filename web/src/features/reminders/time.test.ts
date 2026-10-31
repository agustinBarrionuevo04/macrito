import { describe, expect, it } from 'vitest';
import { REMINDER_WINDOW_MINUTES } from './constants';
import { isDue } from './due';
import { localMoment, normalizeTime, parseTime } from './time';

describe('parseTime / normalizeTime', () => {
  it('acepta HH:MM y HH:MM:SS', () => {
    expect(parseTime('13:05')).toBe(785);
    expect(parseTime('13:05:00')).toBe(785);
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('23:59')).toBe(1439);
    expect(normalizeTime('09:00:00')).toBe('09:00');
  });
  it('rechaza lo que no es una hora', () => {
    for (const bad of ['24:00', '12:60', '1:30', '13h', '', 'ab:cd', null, undefined, 1300]) {
      expect(parseTime(bad), String(bad)).toBeNull();
      expect(normalizeTime(bad)).toBeNull();
    }
  });
});

describe('localMoment', () => {
  it('convierte a la hora local de la zona, con la fecha local', () => {
    const now = new Date('2026-03-15T02:30:00Z');
    expect(localMoment(now, 'America/Argentina/Cordoba')).toEqual({
      date: '2026-03-14',
      minutes: 23 * 60 + 30,
    });
    expect(localMoment(now, 'Asia/Tokyo')).toEqual({ date: '2026-03-15', minutes: 11 * 60 + 30 });
    expect(localMoment(now, 'UTC')).toEqual({ date: '2026-03-15', minutes: 150 });
  });
  it('la medianoche es 0 minutos, no 24 horas', () => {
    expect(localMoment(new Date('2026-03-15T03:00:00Z'), 'America/Argentina/Cordoba')).toEqual({
      date: '2026-03-15',
      minutes: 0,
    });
  });
  it('lanza con una zona inexistente', () => {
    expect(() => localMoment(new Date(), 'No/Existe')).toThrow();
  });
});

describe('isDue', () => {
  const today = { date: '2026-03-15', minutes: 13 * 60 + 10 };
  const setting = { enabled: true, remindAt: '13:00:00', lastSentOn: null as string | null };

  it('toca desde la hora y durante la ventana', () => {
    expect(isDue(setting, { ...today, minutes: 13 * 60 })).toBe(true);
    expect(isDue(setting, today)).toBe(true);
    expect(isDue(setting, { ...today, minutes: 13 * 60 + REMINDER_WINDOW_MINUTES - 1 })).toBe(true);
  });
  it('no toca antes de la hora ni cuando se pasó la ventana', () => {
    expect(isDue(setting, { ...today, minutes: 12 * 60 + 59 })).toBe(false);
    expect(isDue(setting, { ...today, minutes: 13 * 60 + REMINDER_WINDOW_MINUTES })).toBe(false);
  });
  it('no toca si ya se resolvió hoy, pero sí si fue ayer', () => {
    expect(isDue({ ...setting, lastSentOn: '2026-03-15' }, today)).toBe(false);
    expect(isDue({ ...setting, lastSentOn: '2026-03-14' }, today)).toBe(true);
  });
  it('no toca si está desactivado o la hora es ilegible', () => {
    expect(isDue({ ...setting, enabled: false }, today)).toBe(false);
    expect(isDue({ ...setting, remindAt: 'basura' }, today)).toBe(false);
  });
});
