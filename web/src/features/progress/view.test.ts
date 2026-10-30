import { describe, expect, it } from 'vitest';
import { buildProgressView } from './view';
import type { DayTotals } from './types';

const TODAY = '2026-03-15';
const target = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 };

const total = (day: string, kcal: number, extra: Partial<DayTotals> = {}): DayTotals => ({
  day,
  kcal,
  protein_g: 100,
  carbs_g: 200,
  fat_g: 60,
  entries: 2,
  ...extra,
});

const base = { today: TODAY, range: 7 as const, totals: [], weights: [], target };

describe('buildProgressView', () => {
  it('sin datos: nada que mostrar', () => {
    const view = buildProgressView(base);
    expect(view.hasMeals).toBe(false);
    expect(view.summary).toMatchObject({ loggedDays: 0, avg: null, adherencePct: null });
    expect(view.streak).toEqual({ days: 0, capped: false });
    expect(view.weight).toEqual({ readings: [], average: [], change: null });
    expect(view.bars.every((bar) => bar.kcal === null)).toBe(true);
  });

  it('el rango define los días y las columnas diarias (sin 0 kcal para los días sin registrar)', () => {
    const view = buildProgressView({
      ...base,
      range: 7,
      totals: [total('2026-03-15', 2049.6), total('2026-03-13', 1800)],
    });
    expect(view.days).toHaveLength(7);
    expect(view.days.at(-1)).toBe(TODAY);
    expect(view.weeklyBars).toBe(false);
    expect(view.bars).toHaveLength(7);
    expect(view.bars.at(-1)).toMatchObject({
      key: TODAY,
      axis: '15/3',
      full: '15/03/2026',
      kcal: 2050,
    });
    expect(view.bars.at(-3)?.kcal).toBe(1800);
    expect(view.bars.at(-2)?.kcal).toBeNull();
  });

  it('en 90 días las columnas son promedios semanales (13), del más viejo al más nuevo', () => {
    const view = buildProgressView({
      ...base,
      range: 90,
      totals: [total('2026-03-15', 2000), total('2026-03-14', 1000), total('2026-03-01', 3000)],
    });
    expect(view.weeklyBars).toBe(true);
    expect(view.bars).toHaveLength(12); // 90 días = 12 bloques de 7 completos
    expect(view.bars.at(-1)).toMatchObject({ key: TODAY, kcal: 1500 });
    expect(view.bars.at(-1)?.full).toBe('Semana del 9/3 al 15/3');
    expect(view.bars[0]!.key < view.bars.at(-1)!.key).toBe(true);
  });

  it('resumen, adherencia y racha salen de los totales', () => {
    const view = buildProgressView({
      ...base,
      range: 30,
      totals: [total('2026-03-15', 2000), total('2026-03-14', 1000), total('2026-03-13', 2100)],
    });
    expect(view.summary.loggedDays).toBe(3);
    expect(view.summary.adherencePct).toBe(67);
    expect(view.summary.avg?.kcal).toBe(1700);
    expect(view.streak).toEqual({ days: 3, capped: false });
    expect(view.hasMeals).toBe(true);
  });

  it('un registro viejo (fuera del rango pero dentro de 90 días) cuenta como "hay datos"', () => {
    const view = buildProgressView({ ...base, range: 7, totals: [total('2026-01-20', 2000)] });
    expect(view.hasMeals).toBe(true);
    expect(view.summary.loggedDays).toBe(0);
  });

  it('el promedio móvil usa las lecturas de antes del rango como ventana, pero solo muestra el rango', () => {
    const view = buildProgressView({
      ...base,
      range: 7,
      weights: [
        { day: '2026-03-05', weightKg: 82 }, // fuera del rango (es de antes del 9/3)
        { day: '2026-03-10', weightKg: 80 },
        { day: '2026-03-12', weightKg: 78 },
      ],
    });
    expect(view.weight.readings.map((r) => r.day)).toEqual(['2026-03-10', '2026-03-12']);
    // 10/3: ventana 4/3..10/3 → {82, 80} = 81. 12/3: ventana 6/3..12/3 → {80, 78} = 79.
    expect(view.weight.average).toEqual([
      { day: '2026-03-10', weightKg: 81, samples: 2 },
      { day: '2026-03-12', weightKg: 79, samples: 2 },
    ]);
    expect(view.weight.change).toMatchObject({ fromKg: 81, toKg: 79, deltaKg: -2 });
  });

  it('una sola lectura: hay punto pero no hay línea ni cambio', () => {
    const view = buildProgressView({ ...base, weights: [{ day: '2026-03-14', weightKg: 80 }] });
    expect(view.weight.readings).toHaveLength(1);
    expect(view.weight.average).toEqual([]);
    expect(view.weight.change).toBeNull();
  });

  it('sin meta no hay adherencia y los demás números siguen', () => {
    const view = buildProgressView({ ...base, target: null, totals: [total(TODAY, 2000)] });
    expect(view.summary.adherencePct).toBeNull();
    expect(view.summary.avg?.kcal).toBe(2000);
    expect(view.target).toBeNull();
  });

  it('las filas semanales: 1 para 7 días, 4 para 30, 12 para 90', () => {
    for (const [range, rows] of [
      [7, 1],
      [30, 4],
      [90, 12],
    ] as const) {
      expect(buildProgressView({ ...base, range }).weeks).toHaveLength(rows);
    }
  });
});
