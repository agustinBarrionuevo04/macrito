import { parseIsoDate } from '@/lib/nutrition';

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** ¿Es una fecha `YYYY-MM-DD` que existe en el calendario, entre 2000 y 2100? */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const { year } = parseIsoDate(value);
    return year >= MIN_YEAR && year <= MAX_YEAR;
  } catch {
    return false;
  }
}

/** Suma `days` (puede ser negativo) a una fecha, con aritmética de calendario en UTC. */
export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseIsoDate(iso);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export type DayLabel =
  { kind: 'today' | 'yesterday' | 'tomorrow' } | { kind: 'date'; text: string };

/** Etiqueta de la fecha respecto de `today`: "Hoy", "Ayer", "Mañana" o "lunes 16 de marzo". */
export function dayLabel(iso: string, today: string): DayLabel {
  if (iso === today) return { kind: 'today' };
  if (iso === addDays(today, -1)) return { kind: 'yesterday' };
  if (iso === addDays(today, 1)) return { kind: 'tomorrow' };
  const { year, month, day } = parseIsoDate(iso);
  // En UTC a propósito: la fecha ya es "del calendario" y no debe correrse por la zona horaria.
  const text = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return { kind: 'date', text };
}

/**
 * Día que muestra la pantalla: el pedido en la URL si es una fecha válida que no es futura; si no,
 * hoy. La pantalla no deja navegar al futuro, así que una fecha futura en la URL se trata como inválida.
 */
export function resolveDay(requested: string | undefined, today: string): string {
  return isValidDay(requested) && requested <= today ? requested : today;
}
