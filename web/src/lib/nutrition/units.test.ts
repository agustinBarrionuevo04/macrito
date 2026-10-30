import { describe, expect, it } from 'vitest';
import {
  cmToFeetInches,
  cmToInches,
  feetInchesToCm,
  flOzToMl,
  gToOz,
  inchesToCm,
  kcalToKj,
  kgToLbs,
  kjToKcal,
  lbsToKg,
  mlToFlOz,
  ozToG,
} from './units';

describe('energía', () => {
  it('1 kcal = 4.184 kJ', () => {
    expect(kcalToKj(100)).toBeCloseTo(418.4, 6);
    expect(kjToKcal(418.4)).toBeCloseTo(100, 6);
  });
});

describe('longitud', () => {
  it('2.54 cm por pulgada', () => {
    expect(cmToInches(254)).toBeCloseTo(100, 9);
    expect(inchesToCm(10)).toBeCloseTo(25.4, 9);
  });

  it('separa pies y pulgadas', () => {
    expect(cmToFeetInches(175)).toEqual({ feet: 5, inches: 9 });
    expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
  });

  it('nunca devuelve "5 ft 12 in"', () => {
    // 5 ft 11.6 in redondea a 12 → pasa al pie siguiente.
    const cm = (5 * 12 + 11.6) * 2.54;
    expect(cmToFeetInches(cm)).toEqual({ feet: 6, inches: 0 });
  });

  it('ida y vuelta pies/pulgadas ↔ cm', () => {
    expect(feetInchesToCm(5, 9)).toBe(175);
    expect(feetInchesToCm(6, 0)).toBe(183);
  });
});

describe('masa y volumen', () => {
  it('kg ↔ lb con un decimal / dos decimales', () => {
    expect(kgToLbs(70)).toBe(154.3);
    expect(lbsToKg(154.3)).toBe(69.99);
  });

  it('g ↔ oz', () => {
    expect(gToOz(28.3495)).toBeCloseTo(1, 9);
    expect(ozToG(2)).toBeCloseTo(56.699, 3);
  });

  it('ml ↔ fl oz', () => {
    expect(mlToFlOz(29.5735)).toBeCloseTo(1, 9);
    expect(flOzToMl(8)).toBeCloseTo(236.588, 3);
  });
});
