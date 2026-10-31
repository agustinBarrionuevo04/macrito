'use client';

import { useState } from 'react';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatIsoDate, formatShortDate } from '@/lib/ui/format-date';
import { formatNumber } from '@/lib/ui/number';
import { labelIndexes, linearScale, niceTicks } from '../scale';
import type { MovingAveragePoint, WeightPoint } from '../types';

const w = es.progress.weight;

const WIDTH = 360;
const HEIGHT = 200;
const MARGIN = { top: 14, right: 16, bottom: 26, left: 40 };

type Props = {
  /** Los días del período, del más viejo al más nuevo (define el eje horizontal). */
  days: readonly string[];
  readings: readonly WeightPoint[];
  average: readonly MovingAveragePoint[];
};

/**
 * Peso: las lecturas como puntos grises y el promedio móvil de 7 días como línea de énfasis.
 * Tocar (o enfocar) un punto muestra su detalle; la misma información está en la tabla de abajo.
 */
export function WeightChart({ days, readings, average }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  if (readings.length === 0 || days.length === 0) return null;

  const averageByDay = new Map(average.map((point) => [point.day, point.weightKg]));
  const values = [...readings.map((r) => r.weightKg), ...average.map((p) => p.weightKg)];
  const { ticks, min, max, decimals } = niceTicks(Math.min(...values), Math.max(...values), 4);

  const x = linearScale([0, Math.max(days.length - 1, 1)], [MARGIN.left, WIDTH - MARGIN.right]);
  const y = linearScale([min, max], [HEIGHT - MARGIN.bottom, MARGIN.top]);
  const xOf = (day: string) => x(Math.max(days.indexOf(day), 0));

  const line = average
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.day).toFixed(1)},${y(p.weightKg).toFixed(1)}`)
    .join(' ');
  const last = average.at(-1);
  const previous = average.at(-2);
  // El rótulo va del lado opuesto al de donde viene la línea, para no taparla.
  const labelBelow = previous !== undefined && y(previous.weightKg) < y(last?.weightKg ?? 0);
  const sorted = [...readings].sort((a, b) => (a.day < b.day ? -1 : 1));
  const first = sorted[0]!;
  const final = sorted.at(-1)!;

  const readout = (() => {
    if (!selected) return es.progress.hint;
    const reading = readings.find((r) => r.day === selected);
    if (!reading) return es.progress.hint;
    const avg = averageByDay.get(selected);
    const vars = { date: formatIsoDate(selected), weight: formatNumber(reading.weightKg, 1) };
    return avg === undefined
      ? t(w.readout, vars)
      : t(w.readoutAverage, { ...vars, average: formatNumber(avg, 1) });
  })();

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t(w.chartLabel, {
          count: readings.length,
          from: formatNumber(first.weightKg, 1),
          to: formatNumber(final.weightKg, 1),
        })}
        className="h-auto w-full"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted text-[10px] tabular-nums"
            >
              {formatNumber(tick, decimals)}
            </text>
          </g>
        ))}

        {labelIndexes(days.length).map((index) => (
          <text
            key={days[index]}
            x={x(index)}
            y={HEIGHT - 8}
            textAnchor={index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle'}
            className="fill-muted text-[10px]"
          >
            {formatShortDate(days[index]!)}
          </text>
        ))}

        {line && average.length >= 2 ? (
          <path
            d={line}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {readings.map((reading) => (
          <circle
            key={`${reading.day}-${reading.weightKg}`}
            cx={xOf(reading.day)}
            cy={y(reading.weightKg)}
            r={4}
            strokeWidth={2}
            className={
              selected === reading.day
                ? 'fill-foreground stroke-surface'
                : 'fill-muted stroke-surface'
            }
          />
        ))}

        {last ? (
          <>
            <circle
              cx={xOf(last.day)}
              cy={y(last.weightKg)}
              r={5}
              strokeWidth={2}
              className="fill-primary stroke-surface"
            />
            <text
              x={xOf(last.day)}
              y={y(last.weightKg) + (labelBelow ? 18 : -10)}
              textAnchor="end"
              className="fill-foreground text-[11px] font-semibold tabular-nums"
            >
              {formatNumber(last.weightKg, 1)} kg
            </text>
          </>
        ) : null}

        {/* Áreas de toque más grandes que los puntos (44 px), invisibles. */}
        {readings.map((reading) => (
          <rect
            key={`hit-${reading.day}-${reading.weightKg}`}
            x={xOf(reading.day) - 14}
            y={MARGIN.top}
            width={28}
            height={HEIGHT - MARGIN.top - MARGIN.bottom}
            fill="transparent"
            role="button"
            tabIndex={0}
            aria-label={t(w.readout, {
              date: formatIsoDate(reading.day),
              weight: formatNumber(reading.weightKg, 1),
            })}
            onPointerEnter={() => setSelected(reading.day)}
            onClick={() => setSelected(reading.day)}
            onFocus={() => setSelected(reading.day)}
          />
        ))}
      </svg>

      <figcaption className="flex flex-col gap-2">
        <p className="text-muted min-h-5 text-sm tabular-nums" aria-live="polite">
          {readout}
        </p>
        <ul className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-muted size-2 rounded-full" />
            {w.legendReadings}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-primary h-0.5 w-4 rounded-full" />
            {w.legendAverage}
          </li>
        </ul>
        <details>
          <summary className="text-primary min-h-11 cursor-pointer py-3 text-sm font-medium">
            {es.progress.showTable}
          </summary>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted text-left">
                <th className="py-1 font-medium">{w.tableDate}</th>
                <th className="py-1 text-right font-medium">{w.tableWeight}</th>
                <th className="py-1 text-right font-medium">{w.tableAverage}</th>
              </tr>
            </thead>
            <tbody>
              {[...sorted].reverse().map((reading) => (
                <tr key={`${reading.day}-${reading.weightKg}`} className="border-border border-t">
                  <td className="py-1">{formatIsoDate(reading.day)}</td>
                  <td className="py-1 text-right">{formatNumber(reading.weightKg, 1)}</td>
                  <td className="py-1 text-right">
                    {averageByDay.has(reading.day)
                      ? formatNumber(averageByDay.get(reading.day)!, 1)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}
