import { MAX_AGE_YEARS, MIN_AGE_YEARS } from './constants';
import { parseIsoDate } from './date';
import { NutritionInputError, assertInRange } from './errors';

/**
 * Edad en años cumplidos al día `today` (ambas `YYYY-MM-DD`). Calendario exacto:
 * no aproxima con 365 días (eso adelanta o atrasa el cumpleaños hasta ~un mes en 30 años).
 */
export function calcAge(birthDate: string, today: string): number {
  const birth = parseIsoDate(birthDate, 'birthDate');
  const now = parseIsoDate(today, 'today');

  let age = now.year - birth.year;
  if (now.month < birth.month || (now.month === birth.month && now.day < birth.day)) age -= 1;

  if (age < 0) throw new NutritionInputError('birthDate es posterior a la fecha actual');
  return age;
}

/** Valida que la edad esté dentro de lo que la app acepta (13–130). */
export function assertSupportedAge(age: number): void {
  assertInRange(age, MIN_AGE_YEARS, MAX_AGE_YEARS, 'age');
}
