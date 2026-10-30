import { describe, expect, it } from 'vitest';
import { round2, scaleSnapshot, snapshotFromPer100g } from './snapshot';

const milanesa = { kcal: 250, protein_g: 20, carbs_g: 15, fat_g: 12 };

describe('snapshotFromPer100g', () => {
  it('calcula la nutrición de la cantidad pedida', () => {
    expect(snapshotFromPer100g(milanesa, 150)).toEqual({
      kcal: 375,
      protein_g: 30,
      carbs_g: 22.5,
      fat_g: 18,
    });
    expect(snapshotFromPer100g(milanesa, 100)).toEqual(milanesa);
    expect(snapshotFromPer100g(milanesa, 0)).toEqual({
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
  });

  it('redondea a 2 decimales y no arrastra ruido de punto flotante', () => {
    const s = snapshotFromPer100g({ kcal: 62, protein_g: 3.1, carbs_g: 4.7, fat_g: 3.3 }, 33);
    expect(s).toEqual({ kcal: 20.46, protein_g: 1.02, carbs_g: 1.55, fat_g: 1.09 });
    expect(snapshotFromPer100g({ kcal: 0.1, protein_g: 0, carbs_g: 0, fat_g: 0 }, 300).kcal).toBe(
      0.3,
    );
  });

  it('ignora los campos opcionales (fibra, azúcar, sodio)', () => {
    const s = snapshotFromPer100g({ ...milanesa, fiber_g: 3, sodium_mg: 400 }, 100);
    expect(Object.keys(s).sort()).toEqual(['carbs_g', 'fat_g', 'kcal', 'protein_g']);
  });
});

describe('scaleSnapshot', () => {
  it('reescala proporcionalmente', () => {
    const base = snapshotFromPer100g(milanesa, 100);
    expect(scaleSnapshot(base, 100, 150)).toEqual({
      kcal: 375,
      protein_g: 30,
      carbs_g: 22.5,
      fat_g: 18,
    });
    expect(scaleSnapshot(base, 100, 50)).toEqual({
      kcal: 125,
      protein_g: 10,
      carbs_g: 7.5,
      fat_g: 6,
    });
  });

  it('reescalar a la misma cantidad no cambia nada', () => {
    const base = snapshotFromPer100g(milanesa, 130);
    expect(scaleSnapshot(base, 130, 130)).toEqual(base);
  });

  it('parte de la entrada, no del alimento: respeta una entrada ya editada', () => {
    // La entrada se guardó con valores que ya no coinciden con el alimento actual.
    const edited = { kcal: 200, protein_g: 10, carbs_g: 20, fat_g: 5 };
    expect(scaleSnapshot(edited, 100, 200)).toEqual({
      kcal: 400,
      protein_g: 20,
      carbs_g: 40,
      fat_g: 10,
    });
  });

  it('falla si la cantidad original no es positiva (calorías rápidas)', () => {
    expect(() => scaleSnapshot(milanesa, 0, 100)).toThrow(RangeError);
    expect(() => scaleSnapshot(milanesa, -5, 100)).toThrow(RangeError);
    expect(() => scaleSnapshot(milanesa, Number.NaN, 100)).toThrow(RangeError);
  });
});

describe('round2', () => {
  it('redondea a centésimas', () => {
    expect(round2(1.005)).toBe(1);
    expect(round2(2.345)).toBe(2.35);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
