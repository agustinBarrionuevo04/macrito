import { describe, expect, it } from 'vitest';
import type { ActivityLevel, Sex } from '@/types';
import { calcTee, paCoefficient, palValue } from './tdee';

/**
 * Fixtures anclados a la fuente: ninguno de estos números lo calculó este proyecto.
 * IOM 2005, Tablas 5-29 (hombres, pp. 206-209) y 5-30 (mujeres, pp. 210-213), TEE de 24 h a los
 * 30 años. Solo las columnas de IMC ≥ 25 usan las ecuaciones de p. 204. Tolerancia ±1.5 kcal: el
 * libro calculó con las constantes sin redondear (864.1 / 386.5) y p. 204 imprime 864 / 387.
 * Detalle en docs/tdee-iom-2005-verification.md (raíz del repo).
 * Pesos = IMC × altura², no los kg redondeados de la tabla.
 */
type Published = {
  sex: Sex;
  weightKg: number;
  heightM: number;
  level: ActivityLevel;
  kcal: number;
  cite: string;
};

const m = 'male';
const f = 'female';
const sed = 'sedentary';
const low = 'low_active';
const act = 'active';
const very = 'very_active';

const published: Published[] = [
  {
    sex: m,
    weightKg: 52.5625,
    heightM: 1.45,
    level: sed,
    kcal: 2048,
    cite: 'T5-29 h1.45 IMC25 sed',
  },
  {
    sex: m,
    weightKg: 52.5625,
    heightM: 1.45,
    level: low,
    kcal: 2225,
    cite: 'T5-29 h1.45 IMC25 low',
  },
  {
    sex: m,
    weightKg: 52.5625,
    heightM: 1.45,
    level: act,
    kcal: 2447,
    cite: 'T5-29 h1.45 IMC25 act',
  },
  {
    sex: m,
    weightKg: 52.5625,
    heightM: 1.45,
    level: very,
    kcal: 2845,
    cite: 'T5-29 h1.45 IMC25 very',
  },
  {
    sex: m,
    weightKg: 63.075,
    heightM: 1.45,
    level: sed,
    kcal: 2197,
    cite: 'T5-29 h1.45 IMC30 sed',
  },
  {
    sex: m,
    weightKg: 84.1,
    heightM: 1.45,
    level: very,
    kcal: 3535,
    cite: 'T5-29 h1.45 IMC40 very',
  },
  { sex: m, weightKg: 78.75, heightM: 1.5, level: act, kcal: 2951, cite: 'T5-29 h1.50 IMC35 act' },
  { sex: m, weightKg: 64.0, heightM: 1.6, level: sed, kcal: 2286, cite: 'T5-29 h1.60 IMC25 sed' },
  {
    sex: m,
    weightKg: 102.4,
    heightM: 1.6,
    level: very,
    kcal: 4051,
    cite: 'T5-29 h1.60 IMC40 very',
  },
  { sex: m, weightKg: 97.2, heightM: 1.8, level: sed, kcal: 2858, cite: 'T5-29 h1.80 IMC30 sed' },
  { sex: m, weightKg: 97.2, heightM: 1.8, level: low, kcal: 3132, cite: 'T5-29 h1.80 IMC30 low' },
  { sex: m, weightKg: 97.2, heightM: 1.8, level: act, kcal: 3475, cite: 'T5-29 h1.80 IMC30 act' },
  { sex: m, weightKg: 97.2, heightM: 1.8, level: very, kcal: 4092, cite: 'T5-29 h1.80 IMC30 very' },
  { sex: m, weightKg: 152.1, heightM: 1.95, level: sed, kcal: 3713, cite: 'T5-29 h1.95 IMC40 sed' },
  {
    sex: m,
    weightKg: 152.1,
    heightM: 1.95,
    level: very,
    kcal: 5409,
    cite: 'T5-29 h1.95 IMC40 very',
  },
  {
    sex: f,
    weightKg: 52.5625,
    heightM: 1.45,
    level: sed,
    kcal: 1698,
    cite: 'T5-30 h1.45 IMC25 sed',
  },
  {
    sex: f,
    weightKg: 52.5625,
    heightM: 1.45,
    level: low,
    kcal: 1912,
    cite: 'T5-30 h1.45 IMC25 low',
  },
  {
    sex: f,
    weightKg: 52.5625,
    heightM: 1.45,
    level: act,
    kcal: 2112,
    cite: 'T5-30 h1.45 IMC25 act',
  },
  {
    sex: f,
    weightKg: 52.5625,
    heightM: 1.45,
    level: very,
    kcal: 2387,
    cite: 'T5-30 h1.45 IMC25 very',
  },
  { sex: f, weightKg: 84.1, heightM: 1.45, level: sed, kcal: 2042, cite: 'T5-30 h1.45 IMC40 sed' },
  { sex: f, weightKg: 64.0, heightM: 1.6, level: sed, kcal: 1922, cite: 'T5-30 h1.60 IMC25 sed' },
  {
    sex: f,
    weightKg: 102.4,
    heightM: 1.6,
    level: very,
    kcal: 3318,
    cite: 'T5-30 h1.60 IMC40 very',
  },
  { sex: f, weightKg: 97.2, heightM: 1.8, level: sed, kcal: 2416, cite: 'T5-30 h1.80 IMC30 sed' },
  { sex: f, weightKg: 97.2, heightM: 1.8, level: very, kcal: 3428, cite: 'T5-30 h1.80 IMC30 very' },
  { sex: f, weightKg: 152.1, heightM: 1.95, level: sed, kcal: 3113, cite: 'T5-30 h1.95 IMC40 sed' },
  {
    sex: f,
    weightKg: 152.1,
    heightM: 1.95,
    level: very,
    kcal: 4439,
    cite: 'T5-30 h1.95 IMC40 very',
  },
];

describe('calcTee — valores impresos en IOM 2005 (30 años)', () => {
  it.each(published)('$cite → $kcal kcal', ({ sex, weightKg, heightM, level, kcal }) => {
    const tee = calcTee({
      sex,
      age: 30,
      weightKg,
      heightCm: heightM * 100,
      activityLevel: level,
    });
    expect(Math.abs(tee - kcal)).toBeLessThanOrEqual(1.5);
  });

  it('los fixtures discriminan: la agrupación del bug #987 falla por mucho', () => {
    // PA multiplicaba solo el peso y no la altura. Los casos sedentarios (PA = 1) no lo ven.
    const buggy = (c: Published) => {
      const pa = paCoefficient(palValue(c.level), c.sex);
      return c.sex === 'male'
        ? 864 - 9.72 * 30 + pa * 14.2 * c.weightKg + 503 * c.heightM
        : 387 - 7.31 * 30 + pa * 10.9 * c.weightKg + 660.7 * c.heightM;
    };
    const discriminating = published.filter((c) => c.level !== sed);
    expect(discriminating).toHaveLength(16);
    for (const c of discriminating) {
      expect(Math.abs(buggy(c) - c.kcal), c.cite).toBeGreaterThan(50);
    }
  });
});

describe('calcTee — otras edades (derivados de p. 204 por fuera de este repo)', () => {
  const cases: [string, Sex, number, number, number, ActivityLevel, number][] = [
    ['hombre 25 a, 80 kg, 180 cm, sedentario', m, 25, 80, 180, sed, 2662.4],
    ['hombre 25 a, 80 kg, 180 cm, muy activo', m, 25, 80, 180, very, 3764.76],
    ['hombre 19 a, 60 kg, 155 cm, muy activo', m, 19, 60, 155, very, 3192.06],
    ['mujer 54 a, 75 kg, 160 cm, activa', f, 54, 75, 160, act, 2373.03],
    // La tabla de PA de p. 185 para mujeres difiere de p. 204 solo en "low active" (1.12 vs 1.14).
    ['mujer 25 a, 80 kg, 180 cm, poco activa', f, 25, 80, 180, low, 2554.09],
    ['mujer 35 a, 70 kg, 165 cm, sedentaria', f, 35, 70, 165, sed, 1984.31],
  ];

  it.each(cases)('%s', (_name, sex, age, weightKg, heightCm, level, expected) => {
    const tee = calcTee({ sex, age, weightKg, heightCm, activityLevel: level });
    expect(tee).toBeCloseTo(expected, 1);
  });
});

describe('palValue', () => {
  it('devuelve los PAL del plan', () => {
    expect(palValue('sedentary')).toBe(1.25);
    expect(palValue('low_active')).toBe(1.5);
    expect(palValue('active')).toBe(1.75);
    expect(palValue('very_active')).toBe(2.2);
  });
});

describe('paCoefficient — bandas semiabiertas de IOM p. 204', () => {
  it.each([
    [1.0, 'male', 1.0],
    [1.399, 'female', 1.0],
    [1.4, 'male', 1.12],
    [1.4, 'female', 1.14],
    [1.599, 'male', 1.12],
    [1.6, 'male', 1.27],
    [1.6, 'female', 1.27],
    [1.899, 'female', 1.27],
    [1.9, 'male', 1.54],
    [1.9, 'female', 1.45],
    [2.4, 'male', 1.54],
  ] as [number, Sex, number][])('PAL %s (%s) → PA %s', (pal, sex, expected) => {
    expect(paCoefficient(pal, sex)).toBe(expected);
  });
});
