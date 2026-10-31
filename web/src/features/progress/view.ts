import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatIsoDate, formatShortDate } from '@/lib/ui/format-date';
import type { CalorieBar } from './components/calories-chart';
import { HISTORY_DAYS, WEIGHT_WINDOW_DAYS, type Range } from './constants';
import { movingAverage } from './moving-average';
import {
  currentStreak,
  lastDays,
  summarize,
  totalsIn,
  weekRows,
  weightChange,
  type RangeSummary,
  type WeekRow,
  type WeightChange,
} from './stats';
import type { DayTotals, MovingAveragePoint, Targets, WeightPoint } from './types';

export type ProgressView = {
  range: Range;
  days: string[];
  /** ¿Hay algún registro de comida en los últimos 90 días? */
  hasMeals: boolean;
  summary: RangeSummary;
  streak: { days: number; capped: boolean };
  weight: {
    readings: WeightPoint[];
    average: MovingAveragePoint[];
    change: WeightChange | null;
  };
  bars: CalorieBar[];
  /** En 90 días las columnas son promedios semanales. */
  weeklyBars: boolean;
  weeks: WeekRow[];
  target: Targets | null;
};

export type ProgressInput = {
  today: string;
  range: Range;
  totals: readonly DayTotals[];
  /** Pesos desde 6 días antes del inicio del rango, para que el promedio móvil tenga ventana. */
  weights: readonly WeightPoint[];
  target: Targets | null;
};

/** Junta todo lo que muestra la pantalla de progreso. Sin acceso a la base: se puede probar entero. */
export function buildProgressView({
  today,
  range,
  totals,
  weights,
  target,
}: ProgressInput): ProgressView {
  const days = lastDays(today, range);
  const inRange = new Set(days);

  const average = movingAverage(weights, WEIGHT_WINDOW_DAYS).filter((p) => inRange.has(p.day));
  const readings = weights.filter((p) => inRange.has(p.day));

  const weeklyBars = range >= 90;
  const byDay = new Map(totalsIn(totals, days).map((day) => [day.day, day]));
  const bars: CalorieBar[] = weeklyBars
    ? weekRows(totals, today, Math.floor(range / 7))
        .reverse()
        .map((week) => ({
          key: week.to,
          axis: formatShortDate(week.from),
          full: t(es.progress.macros.weekRange, {
            from: formatShortDate(week.from),
            to: formatShortDate(week.to),
          }),
          kcal: week.avg?.kcal ?? null,
        }))
    : days.map((day) => ({
        key: day,
        axis: formatShortDate(day),
        full: formatIsoDate(day),
        kcal: byDay.has(day) ? Math.round(byDay.get(day)!.kcal) : null,
      }));

  return {
    range,
    days,
    hasMeals: totalsIn(totals, lastDays(today, HISTORY_DAYS)).length > 0,
    summary: summarize(totals, days, target?.kcal ?? null),
    streak: currentStreak(totals, today, HISTORY_DAYS),
    weight: { readings, average, change: weightChange(average, readings) },
    bars,
    weeklyBars,
    weeks: weekRows(totals, today, Math.max(Math.floor(range / 7), 1)),
    target,
  };
}
