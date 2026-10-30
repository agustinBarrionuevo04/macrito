import { HEIGHT_CM_RANGE, WEIGHT_KG_RANGE } from './constants';
import { assertInRange } from './errors';

export type BmiCategory =
  'underweight' | 'normal' | 'preobesity' | 'obesity_1' | 'obesity_2' | 'obesity_3';

/** IMC = kg / m². */
export function bmi(weightKg: number, heightCm: number): number {
  assertInRange(weightKg, WEIGHT_KG_RANGE.min, WEIGHT_KG_RANGE.max, 'weightKg');
  assertInRange(heightCm, HEIGHT_CM_RANGE.min, HEIGHT_CM_RANGE.max, 'heightCm');
  return weightKg / (heightCm / 100) ** 2;
}

/** Clasificación OMS. Los límites son inferiores inclusivos (25.0 ya es preobesidad). */
export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'normal';
  if (value < 30) return 'preobesity';
  if (value < 35) return 'obesity_1';
  if (value < 40) return 'obesity_2';
  return 'obesity_3';
}
