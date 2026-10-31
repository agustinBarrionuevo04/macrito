import { describe, expect, it } from 'vitest';
import { parseDayTotals, parseWeights } from './mapping';

describe('parseDayTotals', () => {
  it('lee las filas de daily_totals, también con numéricos como texto', () => {
    expect(
      parseDayTotals([
        { day: '2026-03-10', kcal: 800.75, protein_g: '40', carbs_g: 61, fat_g: 15, entries: '2' },
      ]),
    ).toEqual([
      { day: '2026-03-10', kcal: 800.75, protein_g: 40, carbs_g: 61, fat_g: 15, entries: 2 },
    ]);
  });

  it('descarta las filas ilegibles y tolera una respuesta que no es una lista', () => {
    expect(
      parseDayTotals([
        { day: '2026-03-10', kcal: 'mucho', protein_g: 1, carbs_g: 1, fat_g: 1, entries: 1 },
        null,
        3,
      ]),
    ).toEqual([]);
    for (const bad of [null, undefined, {}, 'x', 5]) expect(parseDayTotals(bad)).toEqual([]);
  });
});

describe('parseWeights', () => {
  it('lee los pesos y descarta los no positivos o ilegibles', () => {
    expect(
      parseWeights([
        { logged_on: '2026-03-10', weight_kg: '79.5' },
        { logged_on: '2026-03-11', weight_kg: 0 },
        { logged_on: '2026-03-12', weight_kg: null },
        { weight_kg: 80 },
      ]),
    ).toEqual([{ day: '2026-03-10', weightKg: 79.5 }]);
    expect(parseWeights(null)).toEqual([]);
  });
});
