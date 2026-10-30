import { addDays } from '@/features/diary/dates';
import { ADHERENCE_TOLERANCE } from './constants';
import type { DayTotals, MovingAveragePoint, Targets, WeightPoint } from './types';

/** Los `count` días que terminan en `today`, del más viejo al más nuevo. */
export function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, -(count - 1 - i)));
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Totales dentro de un rango, en el orden de `days`. Los días sin registros no aparecen. */
export function totalsIn(totals: readonly DayTotals[], days: readonly string[]): DayTotals[] {
  const wanted = new Set(days);
  return totals.filter((t) => wanted.has(t.day) && t.entries > 0);
}

/** ¿Las kcal del día están a ±10 % de la meta? */
export function isOnTarget(kcal: number, target: number): boolean {
  if (!(target > 0)) return false;
  return Math.abs(kcal - target) <= target * ADHERENCE_TOLERANCE;
}

export type RangeSummary = {
  /** Días del rango con al menos una entrada. */
  loggedDays: number;
  totalDays: number;
  /** Promedios sobre los días registrados (un día sin registrar no cuenta como 0 kcal). `null` si no hay ninguno. */
  avg: Pick<Targets, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'> | null;
  /** Porcentaje (0–100) de los días registrados que quedaron dentro de la meta. `null` sin días o sin meta. */
  adherencePct: number | null;
};

export function summarize(
  totals: readonly DayTotals[],
  days: readonly string[],
  targetKcal: number | null,
): RangeSummary {
  const logged = totalsIn(totals, days);
  if (logged.length === 0) {
    return { loggedDays: 0, totalDays: days.length, avg: null, adherencePct: null };
  }
  const mean = (pick: (t: DayTotals) => number) =>
    round1(logged.reduce((sum, t) => sum + pick(t), 0) / logged.length);
  const onTarget =
    targetKcal === null ? null : logged.filter((t) => isOnTarget(t.kcal, targetKcal)).length;
  return {
    loggedDays: logged.length,
    totalDays: days.length,
    avg: {
      kcal: Math.round(logged.reduce((sum, t) => sum + t.kcal, 0) / logged.length),
      protein_g: mean((t) => t.protein_g),
      carbs_g: mean((t) => t.carbs_g),
      fat_g: mean((t) => t.fat_g),
    },
    adherencePct: onTarget === null ? null : Math.round((onTarget / logged.length) * 100),
  };
}

/**
 * Racha: días seguidos con registros hasta hoy. Si hoy todavía no registraste nada la racha no se
 * corta (el día no terminó): se cuenta desde ayer. `capped` avisa que llegó al borde de la historia
 * cargada y puede ser más larga.
 */
export function currentStreak(
  totals: readonly DayTotals[],
  today: string,
  historyDays: number,
): { days: number; capped: boolean } {
  const logged = new Set(totals.filter((t) => t.entries > 0).map((t) => t.day));
  let days = 0;
  for (let back = logged.has(today) ? 0 : 1; back < historyDays; back++) {
    if (!logged.has(addDays(today, -back))) return { days, capped: false };
    days += 1;
  }
  return { days, capped: true };
}

export type WeekRow = {
  /** Primer y último día del bloque de 7 días. */
  from: string;
  to: string;
  loggedDays: number;
  avg: RangeSummary['avg'];
};

/** Bloques de 7 días que terminan hoy (el más nuevo primero), con sus promedios. */
export function weekRows(totals: readonly DayTotals[], today: string, weeks: number): WeekRow[] {
  return Array.from({ length: weeks }, (_, i) => {
    const to = addDays(today, -7 * i);
    const from = addDays(to, -6);
    const days = lastDays(to, 7);
    const summary = summarize(totals, days, null);
    return { from, to, loggedDays: summary.loggedDays, avg: summary.avg };
  });
}

export type WeightChange = {
  fromKg: number;
  toKg: number;
  deltaKg: number;
  /** Cambio por semana según los días entre la primera y la última lectura. `null` con menos de 7 días de datos. */
  perWeekKg: number | null;
};

/** Cambio del peso en el rango: del primer al último punto del promedio móvil (o de las lecturas si no hay). */
export function weightChange(
  average: readonly MovingAveragePoint[],
  readings: readonly WeightPoint[],
): WeightChange | null {
  const series: { day: string; weightKg: number }[] =
    average.length >= 2 ? [...average] : [...readings].sort((a, b) => (a.day < b.day ? -1 : 1));
  const first = series[0];
  const last = series.at(-1);
  if (!first || !last || first.day === last.day) return null;
  const spanDays = daysBetween(first.day, last.day);
  const deltaKg = round1(last.weightKg - first.weightKg);
  return {
    fromKg: round1(first.weightKg),
    toKg: round1(last.weightKg),
    deltaKg,
    perWeekKg: spanDays >= 7 ? round1((deltaKg / spanDays) * 7) : null,
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
