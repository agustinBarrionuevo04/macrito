'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { copyEntries } from '@/features/diary/actions';
import { MealSelect } from '@/features/diary/components/meal-select';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { MealType } from '@/types';
import { addCombo } from '../actions';
import type { RepeatCounts } from '../server';
import type { RecipeSummary } from '../types';

const m = es.recipes;

export type RepeatInfo = { counts: RepeatCounts; yesterday: string; lastWeek: string };

type Props = {
  day: string;
  initialMeal: MealType | null;
  combos: RecipeSummary[];
  repeat: RepeatInfo | null;
  onViewDiary: () => void;
};

/**
 * Atajos para cargar rápido: repetir una comida de ayer o de la semana pasada, o agregar una comida
 * frecuente. Todo a la comida elegida arriba y al día que se está cargando.
 */
export function QuickPanel({ day, initialMeal, combos, repeat, onViewDiary }: Props) {
  const toast = useToast();
  const [meal, setMeal] = useState<MealType>(initialMeal ?? 'lunch');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mealName = es.diary.meals[meal].toLowerCase();

  const counts = repeat?.counts[meal];
  const nothing = counts !== undefined && counts.yesterday === 0 && counts.lastWeek === 0;

  function notify(message: string) {
    setError(null);
    toast.show({
      message,
      tone: 'success',
      action: { label: es.addFood.portion.view, onClick: onViewDiary },
    });
  }

  function repeatFrom(sourceDay: string) {
    startTransition(async () => {
      const result = await copyEntries({
        source: { scope: 'meal', day: sourceDay, mealType: meal },
        toDay: day,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify(t(m.repeat.done, { count: result.count, meal: mealName }));
    });
  }

  function addComboToDiary(combo: RecipeSummary) {
    startTransition(async () => {
      const result = await addCombo(combo.id, day, meal);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify(t(m.use.comboAdded, { meal: mealName }));
    });
  }

  return (
    <details className="border-border rounded-xl border">
      <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium">
        {m.repeat.title}
      </summary>
      <div className="flex flex-col gap-4 px-3 pb-3">
        <MealSelect label={m.repeat.meal} value={meal} onChange={setMeal} />

        {repeat && counts ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-sm">{m.repeat.help}</p>
            {nothing ? (
              <p className="text-muted text-sm">{m.repeat.none}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  disabled={pending || counts.yesterday === 0}
                  onClick={() => repeatFrom(repeat.yesterday)}
                >
                  {t(m.repeat.yesterday, { count: counts.yesterday })}
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending || counts.lastWeek === 0}
                  onClick={() => repeatFrom(repeat.lastWeek)}
                >
                  {t(m.repeat.lastWeek, { count: counts.lastWeek })}
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {combos.length > 0 ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-muted text-sm font-semibold">{m.use.combos}</h3>
            <ul className="flex flex-col">
              {combos.map((combo) => (
                <li key={combo.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => addComboToDiary(combo)}
                    aria-label={t(m.use.addCombo, { name: combo.name })}
                    className="hover:bg-surface-muted flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-2 text-left disabled:opacity-60"
                  >
                    <span className="truncate font-medium">{combo.name}</span>
                    <span className="text-muted shrink-0 text-sm tabular-nums">
                      {formatNumber(combo.kcal, 0)} kcal
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}

        <Link
          href="/recipes"
          className="text-primary inline-flex min-h-11 items-center text-sm font-medium"
        >
          {m.use.manage}
        </Link>
      </div>
    </details>
  );
}
