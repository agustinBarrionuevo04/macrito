'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatIsoDate } from '@/lib/ui/format-date';
import type { MealType } from '@/types';
import { copyEntries } from '../actions';
import { addDays, isValidDay } from '../dates';
import { MealSelect } from './meal-select';

const c = es.diary.copy;

export type CopySource =
  | { scope: 'entry'; id: string; name: string; meal: MealType }
  | { scope: 'meal'; meal: MealType; count: number }
  | { scope: 'day'; count: number };

type Props = {
  /** `null` = cerrada. */
  source: CopySource | null;
  onClose: () => void;
  day: string;
  today: string;
};

/** Copia una entrada, una comida o el día entero a otra fecha. */
export function CopySheet({ source, onClose, day, today }: Props) {
  // Por defecto: hoy si se está mirando otro día; si no, ayer.
  const [toDay, setToDay] = useState(day === today ? addDays(today, -1) : today);
  const [toMeal, setToMeal] = useState<MealType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const description = !source
    ? undefined
    : source.scope === 'entry'
      ? t(c.entry, { name: source.name })
      : source.scope === 'meal'
        ? t(c.meal, { count: source.count, meal: es.diary.meals[source.meal].toLowerCase() })
        : t(c.day, { count: source.count });

  function submit() {
    if (!source) return;
    if (!isValidDay(toDay) || toDay > today) {
      setError(es.diary.errors.invalidDay);
      return;
    }
    if (source.scope !== 'entry' && toDay === day) {
      setError(c.sameDay);
      return;
    }
    const payload =
      source.scope === 'entry'
        ? { source: { scope: 'entry', id: source.id }, toDay, toMeal: toMeal ?? source.meal }
        : source.scope === 'meal'
          ? { source: { scope: 'meal', day, mealType: source.meal }, toDay }
          : { source: { scope: 'day', day }, toDay };

    startTransition(async () => {
      const result = await copyEntries(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show({ message: t(c.done, { date: formatIsoDate(toDay) }), tone: 'success' });
      setError(null);
      onClose();
    });
  }

  return (
    <Sheet open={source !== null} onClose={onClose} title={c.title} description={description}>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="copy-date" className="text-sm font-medium">
            {c.date}
          </label>
          <input
            id="copy-date"
            type="date"
            value={toDay}
            min="2000-01-01"
            max={today}
            onChange={(event) => {
              setToDay(event.target.value);
              setError(null);
            }}
            className="bg-surface border-border focus:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
          />
        </div>

        {source?.scope === 'entry' ? (
          <MealSelect label={c.meal_target} value={toMeal ?? source.meal} onChange={setToMeal} />
        ) : null}

        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={pending}>
          {c.submit}
        </Button>
      </form>
    </Sheet>
  );
}
