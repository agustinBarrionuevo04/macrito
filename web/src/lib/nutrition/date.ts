import { NutritionInputError } from './errors';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type YMD = { year: number; month: number; day: number };

/** Parsea `YYYY-MM-DD` validando que el día exista (rechaza 2026-02-30). */
export function parseIsoDate(value: string, name = 'fecha'): YMD {
  const match = ISO_DATE.exec(value);
  if (!match)
    throw new NutritionInputError(`${name} debe tener formato YYYY-MM-DD (recibido: ${value})`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new NutritionInputError(`${name} no existe en el calendario (recibido: ${value})`);
  }
  return { year, month, day };
}

/** Fecha de hoy (`YYYY-MM-DD`) en una zona horaria IANA. Nunca en UTC. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  // 'en-CA' formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
