import { describe, expect, it } from 'vitest';
import { movingAverage } from './moving-average';

const w = (day: string, weightKg: number) => ({ day, weightKg });

describe('movingAverage', () => {
  it('promedia las lecturas de los últimos 7 días (incluido el día), calculado a mano', () => {
    const readings = [
      w('2026-03-01', 80),
      w('2026-03-02', 82),
      w('2026-03-04', 81),
      w('2026-03-09', 79),
    ];
    expect(movingAverage(readings)).toEqual([
      // 1/3 solo: una lectura, no alcanza el mínimo y se descarta
      { day: '2026-03-02', weightKg: 81, samples: 2 }, // (80+82)/2
      { day: '2026-03-04', weightKg: 81, samples: 3 }, // (80+82+81)/3
      // 9/3: la ventana es 3/3..9/3, así que quedan 4/3 (81) y 9/3 (79)
      { day: '2026-03-09', weightKg: 80, samples: 2 },
    ]);
  });

  it('la ventana incluye ambos bordes: 7 días exactos', () => {
    const points = movingAverage([w('2026-03-01', 80), w('2026-03-07', 82), w('2026-03-08', 90)]);
    // 7/3: ventana 1/3..7/3 → entra el 1/3. 8/3: ventana 2/3..8/3 → ya no.
    expect(points.find((p) => p.day === '2026-03-07')).toMatchObject({ weightKg: 81, samples: 2 });
    expect(points.find((p) => p.day === '2026-03-08')).toMatchObject({ weightKg: 86, samples: 2 });
  });

  it('con minSamples 1 hay un punto por lectura y el primero es la propia lectura', () => {
    const points = movingAverage([w('2026-03-01', 80), w('2026-03-02', 82)], 7, 1);
    expect(points).toEqual([
      { day: '2026-03-01', weightKg: 80, samples: 1 },
      { day: '2026-03-02', weightKg: 81, samples: 2 },
    ]);
  });

  it('no depende del orden de entrada ni modifica el arreglo recibido', () => {
    const shuffled = [w('2026-03-04', 81), w('2026-03-01', 80), w('2026-03-02', 82)];
    const copy = [...shuffled];
    expect(movingAverage(shuffled).map((p) => p.day)).toEqual(['2026-03-02', '2026-03-04']);
    expect(shuffled).toEqual(copy);
  });

  it('dos lecturas el mismo día cuentan las dos', () => {
    const points = movingAverage([w('2026-03-01', 80), w('2026-03-01', 82)]);
    expect(points).toEqual([{ day: '2026-03-01', weightKg: 81, samples: 2 }]);
  });

  it('cruza el cambio de mes y de año', () => {
    const points = movingAverage([w('2025-12-30', 80), w('2026-01-02', 82)]);
    expect(points).toEqual([{ day: '2026-01-02', weightKg: 81, samples: 2 }]);
  });

  it('vacío y una sola lectura dan vacío', () => {
    expect(movingAverage([])).toEqual([]);
    expect(movingAverage([w('2026-03-01', 80)])).toEqual([]);
  });

  it('rechaza parámetros inválidos', () => {
    expect(() => movingAverage([], 1)).toThrow(RangeError);
    expect(() => movingAverage([], 7, 0)).toThrow(RangeError);
  });

  it('una ventana de 2 días promedia solo con el día anterior', () => {
    const points = movingAverage(
      [w('2026-03-01', 80), w('2026-03-02', 82), w('2026-03-04', 70)],
      2,
    );
    expect(points).toEqual([{ day: '2026-03-02', weightKg: 81, samples: 2 }]);
  });
});
