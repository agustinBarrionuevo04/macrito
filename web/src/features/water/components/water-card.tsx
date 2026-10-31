'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import { progressRatio } from '@/lib/ui/progress';
import { addWater, undoLastWater } from '../actions';
import { MAX_WATER_PER_LOG_ML, WATER_QUICK_AMOUNTS } from '../goal';

const w = es.water;

type Props = { day: string; totalMl: number; logs: number; goalMl: number; custom: boolean };

/** Agua del día: barra contra la meta, tomas rápidas, otra cantidad y deshacer la última. */
export function WaterCard({ day, totalMl, logs, goalMl, custom }: Props) {
  const toast = useToast();
  const [other, setOther] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reached = totalMl >= goalMl;
  const ratio = progressRatio(totalMl, goalMl);

  function add(ml: number) {
    startTransition(async () => {
      const result = await addWater(day, ml);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.show({ message: t(w.added, { ml: formatNumber(ml, 0) }), tone: 'success' });
    });
  }

  function undo() {
    startTransition(async () => {
      const result = await undoLastWater(day);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.show({ message: w.undone, tone: 'info' });
    });
  }

  return (
    <section aria-labelledby="water-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="water-title" className="text-lg font-semibold">
          {w.title}
        </h2>
        <span className="text-muted text-sm tabular-nums">
          {t(w.progress, { total: formatNumber(totalMl, 0), goal: formatNumber(goalMl, 0) })}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={t(w.progressLabel, {
          total: formatNumber(totalMl, 0),
          goal: formatNumber(goalMl, 0),
        })}
        aria-valuemin={0}
        aria-valuemax={goalMl}
        aria-valuenow={Math.min(totalMl, goalMl)}
        className="bg-surface-muted h-3 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="text-muted text-xs">
        {reached ? <span className="text-primary font-medium">{w.reached} </span> : null}
        {custom ? w.custom : w.suggested}
      </p>

      <div className="grid grid-cols-4 gap-2">
        {WATER_QUICK_AMOUNTS.map((ml) => (
          <Button
            key={ml}
            variant="secondary"
            size="sm"
            disabled={pending}
            aria-label={t(w.add, { ml })}
            onClick={() => add(ml)}
            className="px-1"
          >
            +{formatNumber(ml, 0)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOther((open) => !open)}
          aria-expanded={other}
        >
          {w.other}
        </Button>
        {logs > 0 ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={undo}>
            {w.undo}
          </Button>
        ) : null}
      </div>

      {other ? (
        <form
          noValidate
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (amount === null || amount < 1 || amount > MAX_WATER_PER_LOG_ML) {
              setError(t(w.errors.amount, { max: formatNumber(MAX_WATER_PER_LOG_ML, 0) }));
              return;
            }
            add(Math.round(amount));
            setAmount(null);
          }}
        >
          <NumberInput
            className="min-w-0 flex-1"
            label={w.otherLabel}
            unit="ml"
            decimals={0}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setError(null);
            }}
          />
          <Button type="submit" loading={pending}>
            {w.addOther}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
