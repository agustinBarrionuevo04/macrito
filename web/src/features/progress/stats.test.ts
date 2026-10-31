import { describe, expect, it } from 'vitest';
import {
  currentStreak,
  isOnTarget,
  lastDays,
  summarize,
  totalsIn,
  weekRows,
  weightChange,
} from './stats';
import type { DayTotals } from './types';

const t = (day: string, kcal: number, extra: Partial<DayTotals> = {}): DayTotals => ({
  day,
  kcal,
  protein_g: 100,
  carbs_g: 200,
  fat_g: 60,
  entries: 3,
  ...extra,
});

const TODAY = '2026-03-15';

describe('lastDays', () => {
  it('los N días que terminan hoy, del más viejo al más nuevo', () => {
    expect(lastDays('2026-03-03', 5)).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ]);
    expect(lastDays(TODAY, 1)).toEqual([TODAY]);
  });
});

describe('isOnTarget', () => {
  it('±10 % de la meta, con los bordes incluidos', () => {
    expect(isOnTarget(2000, 2000)).toBe(true);
    expect(isOnTarget(1800, 2000)).toBe(true);
    expect(isOnTarget(2200, 2000)).toBe(true);
    expect(isOnTarget(1799, 2000)).toBe(false);
    expect(isOnTarget(2201, 2000)).toBe(false);
  });
  it('sin meta válida nunca está dentro', () => {
    expect(isOnTarget(100, 0)).toBe(false);
    expect(isOnTarget(100, -5)).toBe(false);
    expect(isOnTarget(100, Number.NaN)).toBe(false);
  });
});

describe('totalsIn', () => {
  it('filtra por días y descarta los días sin entradas', () => {
    const totals = [
      t('2026-03-14', 1),
      t('2026-03-15', 2),
      t('2026-03-10', 3),
      t('2026-03-13', 4, { entries: 0 }),
    ];
    expect(totalsIn(totals, ['2026-03-13', '2026-03-14', '2026-03-15']).map((x) => x.kcal)).toEqual(
      [1, 2],
    );
  });
});

describe('summarize', () => {
  it('promedia solo los días registrados (un día sin registrar no cuenta como 0 kcal)', () => {
    const totals = [t('2026-03-15', 2000), t('2026-03-14', 1000), t('2026-03-12', 3000)];
    const days = lastDays(TODAY, 7); // 4 días sin registrar
    const result = summarize(totals, days, 2000);
    expect(result.loggedDays).toBe(3);
    expect(result.totalDays).toBe(7);
    expect(result.avg).toEqual({ kcal: 2000, protein_g: 100, carbs_g: 200, fat_g: 60 });
  });

  it('adherencia: porcentaje de días registrados dentro de ±10 % (redondeado)', () => {
    const totals = [t('2026-03-15', 2000), t('2026-03-14', 1000), t('2026-03-13', 2150)];
    expect(summarize(totals, lastDays(TODAY, 7), 2000).adherencePct).toBe(67); // 2 de 3
  });

  it('sin meta no hay adherencia; sin registros no hay promedios', () => {
    expect(summarize([t(TODAY, 2000)], [TODAY], null).adherencePct).toBeNull();
    expect(summarize([], lastDays(TODAY, 7), 2000)).toEqual({
      loggedDays: 0,
      totalDays: 7,
      avg: null,
      adherencePct: null,
    });
  });

  it('ignora los días fuera del rango', () => {
    const result = summarize([t('2026-01-01', 9999), t(TODAY, 1500)], lastDays(TODAY, 7), 2000);
    expect(result.avg?.kcal).toBe(1500);
  });

  it('redondea los promedios sin ruido de punto flotante', () => {
    const totals = [t(TODAY, 100, { protein_g: 0.1 }), t('2026-03-14', 100, { protein_g: 0.2 })];
    expect(summarize(totals, lastDays(TODAY, 2), 100).avg?.protein_g).toBe(0.2); // 0,15 → 0,2
  });
});

describe('currentStreak', () => {
  const days = (...list: string[]) => list.map((d) => t(d, 1));

  it('cuenta los días seguidos hasta hoy', () => {
    expect(
      currentStreak(days('2026-03-15', '2026-03-14', '2026-03-13', '2026-03-11'), TODAY, 90),
    ).toEqual({
      days: 3,
      capped: false,
    });
  });

  it('si hoy todavía no registraste, la racha no se corta: cuenta desde ayer', () => {
    expect(currentStreak(days('2026-03-14', '2026-03-13'), TODAY, 90)).toEqual({
      days: 2,
      capped: false,
    });
  });

  it('un día sin registrar antes de ayer sí la corta', () => {
    expect(currentStreak(days('2026-03-13', '2026-03-12'), TODAY, 90)).toEqual({
      days: 0,
      capped: false,
    });
  });

  it('sin registros es 0', () => {
    expect(currentStreak([], TODAY, 90)).toEqual({ days: 0, capped: false });
  });

  it('un día con 0 entradas no cuenta', () => {
    expect(currentStreak([t(TODAY, 0, { entries: 0 })], TODAY, 90)).toEqual({
      days: 0,
      capped: false,
    });
  });

  it('avisa si llegó al borde de la historia cargada', () => {
    const all = lastDays(TODAY, 10).map((d) => t(d, 1));
    expect(currentStreak(all, TODAY, 10)).toEqual({ days: 10, capped: true });
    expect(currentStreak(all.slice(1), TODAY, 10)).toEqual({ days: 9, capped: false });
  });
});

describe('weekRows', () => {
  it('bloques de 7 días que terminan hoy, el más nuevo primero', () => {
    const totals = [t('2026-03-15', 2000), t('2026-03-09', 1000), t('2026-03-08', 3000)];
    const rows = weekRows(totals, TODAY, 3);
    expect(rows.map((r) => [r.from, r.to])).toEqual([
      ['2026-03-09', '2026-03-15'],
      ['2026-03-02', '2026-03-08'],
      ['2026-02-23', '2026-03-01'],
    ]);
    expect(rows[0]).toMatchObject({ loggedDays: 2, avg: { kcal: 1500 } });
    expect(rows[1]).toMatchObject({ loggedDays: 1, avg: { kcal: 3000 } });
    expect(rows[2]).toMatchObject({ loggedDays: 0, avg: null });
  });
});

describe('weightChange', () => {
  const avg = (day: string, weightKg: number) => ({ day, weightKg, samples: 3 });

  it('del primer al último punto del promedio, por semana si hay una semana de datos', () => {
    const change = weightChange([avg('2026-03-01', 80), avg('2026-03-15', 79)], []);
    expect(change).toEqual({ fromKg: 80, toKg: 79, deltaKg: -1, perWeekKg: -0.5 });
  });

  it('con menos de una semana no da ritmo semanal', () => {
    expect(
      weightChange([avg('2026-03-01', 80), avg('2026-03-04', 79.4)], [])?.perWeekKg,
    ).toBeNull();
  });

  it('sin promedio usa las lecturas crudas, sin importar el orden', () => {
    const change = weightChange(
      [],
      [
        { day: '2026-03-10', weightKg: 78 },
        { day: '2026-03-01', weightKg: 80 },
      ],
    );
    expect(change).toMatchObject({ fromKg: 80, toKg: 78, deltaKg: -2 });
  });

  it('una sola lectura o ninguna: no hay cambio', () => {
    expect(weightChange([], [])).toBeNull();
    expect(weightChange([], [{ day: '2026-03-01', weightKg: 80 }])).toBeNull();
  });
});
