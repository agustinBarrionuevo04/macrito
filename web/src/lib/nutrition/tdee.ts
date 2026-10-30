import type { ActivityLevel, Sex } from '@/types';
import { PAL_BY_LEVEL } from './constants';

/**
 * Gasto energético total (TEE), ecuaciones IOM 2005 p. 204 ("Ages 19 Years and Older"):
 *
 *   Hombre: TEE = 864 − 9.72·edad + PA·(14.2·peso_kg + 503·altura_m)
 *   Mujer:  TEE = 387 − 7.31·edad + PA·(10.9·peso_kg + 660.7·altura_m)
 *
 * PA multiplica el paréntesis completo (peso Y altura). Quitar esos paréntesis subestima
 * entre 109 y 489 kcal/día (OpenNutriTracker #987).
 * Ver docs/tdee-iom-2005-verification.md en la raíz del repo.
 */

export function palValue(level: ActivityLevel): number {
  return PAL_BY_LEVEL[level];
}

/** Coeficiente PA (IOM p. 204) según PAL y sexo. Bandas semiabiertas como en el libro. */
export function paCoefficient(pal: number, sex: Sex): number {
  if (pal < 1.4) return 1.0;
  if (pal < 1.6) return sex === 'male' ? 1.12 : 1.14;
  if (pal < 1.9) return 1.27;
  return sex === 'male' ? 1.54 : 1.45;
}

export type TeeInput = {
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  activityLevel: ActivityLevel;
};

export function calcTee({ sex, age, weightKg, heightCm, activityLevel }: TeeInput): number {
  const pa = paCoefficient(palValue(activityLevel), sex);
  const heightM = heightCm / 100;
  return sex === 'male'
    ? 864 - 9.72 * age + pa * (14.2 * weightKg + 503 * heightM)
    : 387 - 7.31 * age + pa * (10.9 * weightKg + 660.7 * heightM);
}
