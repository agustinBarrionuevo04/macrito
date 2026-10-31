'use client';

import { useState } from 'react';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import { columnPath, labelIndexes, linearScale, niceTicks } from '../scale';

const c = es.progress.calories;

const WIDTH = 360;
const HEIGHT = 200;
const MARGIN = { top: 16, right: 16, bottom: 26, left: 44 };
const MAX_COLUMN_WIDTH = 24;
const GAP = 2;

export type CalorieBar = {
  key: string;
  /** Rótulo corto del eje ("15/3"). */
  axis: string;
  /** Texto largo para el detalle y la tabla ("15/03/2026" o "Semana 9/3 al 15/3"). */
  full: string;
  /** `null` = no hay registros (no se dibuja: un día sin registrar no es 0 kcal). */
  kcal: number | null;
};

type Props = { bars: readonly CalorieBar[]; target: number | null; weekly: boolean };

/** Calorías por día (o por semana en 90 días) contra la meta, como columnas finas y una línea de meta. */
export function CaloriesChart({ bars, target, weekly }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const logged = bars.filter((bar) => bar.kcal !== null);
  if (logged.length === 0) {
    return <p className="text-muted text-sm">{c.empty}</p>;
  }

  const top = Math.max(...logged.map((bar) => bar.kcal!), target ?? 0);
  const { ticks, max } = niceTicks(0, top * 1.05, 4);
  const y = linearScale([0, max], [HEIGHT - MARGIN.bottom, MARGIN.top]);
  const baseline = HEIGHT - MARGIN.bottom;

  const slot = (WIDTH - MARGIN.left - MARGIN.right) / bars.length;
  const width = Math.max(Math.min(slot - GAP, MAX_COLUMN_WIDTH), 2);
  const xOf = (index: number) => MARGIN.left + slot * index + (slot - width) / 2;

  const readout = (() => {
    const bar = bars.find((b) => b.key === selected && b.kcal !== null);
    if (!bar) return es.progress.hint;
    return target === null
      ? t(c.readoutNoTarget, { date: bar.full, kcal: formatNumber(bar.kcal!, 0) })
      : t(c.readout, {
          date: bar.full,
          kcal: formatNumber(bar.kcal!, 0),
          target: formatNumber(target, 0),
        });
  })();

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t(c.chartLabel, {
          count: logged.length,
          target: target === null ? '—' : formatNumber(target, 0),
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
              {formatNumber(tick, 0)}
            </text>
          </g>
        ))}

        {bars.map((bar, index) =>
          bar.kcal === null ? null : (
            <path
              key={bar.key}
              d={columnPath(xOf(index), baseline, width, baseline - y(bar.kcal))}
              className={selected === bar.key ? 'fill-foreground' : 'fill-primary'}
            />
          ),
        )}

        {target !== null ? (
          <g>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(target)}
              y2={y(target)}
              className="stroke-foreground"
              strokeWidth={1.5}
            />
            <text
              x={WIDTH - MARGIN.right}
              y={y(target) - 4}
              textAnchor="end"
              className="fill-foreground text-[10px] font-semibold tabular-nums"
            >
              {t(c.target, { kcal: formatNumber(target, 0) })}
            </text>
          </g>
        ) : null}

        {labelIndexes(bars.length).map((index) => (
          <text
            key={bars[index]!.key}
            x={xOf(index) + width / 2}
            y={HEIGHT - 8}
            textAnchor={index === 0 ? 'start' : index === bars.length - 1 ? 'end' : 'middle'}
            className="fill-muted text-[10px]"
          >
            {bars[index]!.axis}
          </text>
        ))}

        {bars.map((bar, index) =>
          bar.kcal === null ? null : (
            <rect
              key={`hit-${bar.key}`}
              x={MARGIN.left + slot * index - Math.max((24 - slot) / 2, 0)}
              y={MARGIN.top}
              width={Math.max(slot, 24)}
              height={baseline - MARGIN.top}
              fill="transparent"
              role="button"
              tabIndex={0}
              aria-label={t(c.readoutNoTarget, { date: bar.full, kcal: formatNumber(bar.kcal, 0) })}
              onPointerEnter={() => setSelected(bar.key)}
              onClick={() => setSelected(bar.key)}
              onFocus={() => setSelected(bar.key)}
            />
          ),
        )}
      </svg>

      <figcaption className="flex flex-col gap-2">
        <p className="text-muted min-h-5 text-sm tabular-nums" aria-live="polite">
          {readout}
        </p>
        <details>
          <summary className="text-primary min-h-11 cursor-pointer py-3 text-sm font-medium">
            {es.progress.showTable}
          </summary>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted text-left">
                <th className="py-1 font-medium">{weekly ? c.tableWeek : c.tableDate}</th>
                <th className="py-1 text-right font-medium">{c.tableKcal}</th>
              </tr>
            </thead>
            <tbody>
              {[...logged].reverse().map((bar) => (
                <tr key={bar.key} className="border-border border-t">
                  <td className="py-1">{bar.full}</td>
                  <td className="py-1 text-right">{formatNumber(bar.kcal!, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}
