'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { MEAL_ORDER } from '@/features/diary/types';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { cx } from '@/lib/ui/cx';
import { formatNumber } from '@/lib/ui/number';
import type { MealType } from '@/types';
import { addSuggestion } from '../actions';
import { PlanApiError, requestPlan } from '../api';
import type { PlanMode, PlanOption, PlanResponse, Remaining } from '../types';
import { OptionCard } from './option-card';

const a = es.assistant;

type Props = {
  day: string;
  today: string;
  initialMeal: MealType;
  initialRemaining: Remaining;
};

type Phase =
  { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; response: PlanResponse; mode: PlanMode };

function remainingText(remaining: Remaining): string {
  return t(a.remainingValue, {
    kcal: formatNumber(remaining.kcal, 0),
    protein: formatNumber(remaining.protein_g, 0),
    carbs: formatNumber(remaining.carbs_g, 0),
    fat: formatNumber(remaining.fat_g, 0),
  });
}

/** "¿Qué como?": elegir comida (o armar el día), pedir opciones y agregarlas al diario con un toque. */
export function AssistantView({ day, today, initialMeal, initialRemaining }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [mode, setMode] = useState<PlanMode>('meal');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<ReadonlySet<number>>(new Set());
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const remaining = phase.kind === 'done' ? phase.response.remaining : initialRemaining;

  async function suggest() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setError(null);
    setAdded(new Set());
    setPhase({ kind: 'working' });
    try {
      const response = await requestPlan({ mode, meal, date: day }, current.signal);
      setPhase({ kind: 'done', response, mode });
    } catch (caught) {
      if (current.signal.aborted) return;
      setError(caught instanceof PlanApiError ? caught.message : a.errors.generic);
      setPhase({ kind: 'idle' });
    }
  }

  async function add(option: PlanOption, index: number) {
    setPendingIndex(index);
    const result = await addSuggestion(day, {
      meal: option.meal,
      items: option.items.map((item) => ({ foodId: item.food.id, grams: item.grams })),
    });
    setPendingIndex(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setAdded((current) => new Set(current).add(index));
    toast.show({
      message: t(a.added, { meal: es.diary.meals[option.meal].toLowerCase() }),
      tone: 'success',
      action: {
        label: a.viewDiary,
        onClick: () => router.push(day === today ? '/' : `/?date=${day}`),
      },
    });
  }

  const working = phase.kind === 'working';
  const result = phase.kind === 'done' ? phase : null;
  const planTotal =
    result?.mode === 'day' && result.response.status === 'ok'
      ? result.response.options.reduce((sum, option) => sum + option.totals.kcal, 0)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={a.title}
        className="bg-surface-muted grid grid-cols-2 gap-1 rounded-xl p-1"
      >
        {(['meal', 'day'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cx(
              'min-h-11 rounded-lg px-2 text-sm font-medium',
              mode === id ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
            )}
          >
            {a.modes[id]}
          </button>
        ))}
      </div>

      {mode === 'meal' ? (
        <div role="group" aria-label={a.meal} className="grid grid-cols-4 gap-1">
          {MEAL_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={meal === id}
              onClick={() => setMeal(id)}
              className={cx(
                'min-h-11 rounded-lg border px-1 text-sm font-medium',
                meal === id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted',
              )}
            >
              {es.diary.meals[id]}
            </button>
          ))}
        </div>
      ) : null}

      <section aria-label={a.remaining} className="bg-surface-muted rounded-xl p-3">
        <p className="text-muted text-xs font-medium">{a.remaining}</p>
        <p className="text-sm font-semibold tabular-nums">{remainingText(remaining)}</p>
      </section>

      <Button size="lg" loading={working} onClick={suggest}>
        {working ? a.working : result ? a.again : a.suggest}
      </Button>

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      {working ? (
        <div role="status" aria-label={a.working} className="flex flex-col gap-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : null}

      {result?.response.status === 'reached' ? (
        <p role="status" className="bg-surface-muted rounded-xl p-3 text-sm">
          {a.reached}
        </p>
      ) : null}

      {result?.response.status === 'ok' ? (
        <>
          {planTotal !== null ? (
            <p className="text-sm font-medium tabular-nums">
              {t(a.dayTotal, {
                kcal: formatNumber(planTotal, 0),
                remaining: formatNumber(result.response.remaining.kcal, 0),
              })}
            </p>
          ) : null}
          <ul aria-label={a.title} className="flex flex-col gap-3">
            {result.response.options.map((option, index) => (
              <OptionCard
                key={`${option.title}-${index}`}
                option={option}
                index={index}
                added={added.has(index)}
                pending={pendingIndex === index}
                showMeal={result.mode === 'day'}
                onAdd={() => void add(option, index)}
              />
            ))}
          </ul>
        </>
      ) : null}

      <p className="text-muted text-xs">{a.disclaimer}</p>
    </div>
  );
}
