'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { createAiFood } from '../actions';
import { MAX_QUANTITY_G } from '@/features/diary/constants';
import { MealSelect } from '@/features/diary/components/meal-select';
import { snapshotFromPer100g } from '@/features/diary/snapshot';
import { sumSnapshots } from '@/features/diary/totals';
import type { DiaryResult } from '@/features/diary/types';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { EntryDraft, Food, MealType, Origin } from '@/types';
import type { ReviewItem } from '../resolve';

const r = es.aiFood.review;

type Props = {
  items: ReviewItem[];
  origin: Extract<Origin, 'ai_photo' | 'ai_text'>;
  defaultMeal: MealType;
  /** Se muestra dentro de una hoja para cambiar el alimento de un renglón o agregar otro. */
  renderPicker: (onSelect: (food: Food) => void) => React.ReactNode;
  onAdd: (draft: EntryDraft) => Promise<DiaryResult>;
  /** Todo se agregó: volver al inicio. */
  onDone: () => void;
  onViewDiary: () => void;
  onRetry: () => void;
};

const per100gOf = (item: ReviewItem) => item.food?.per100g ?? item.guess ?? null;

/** Pantalla de revisión: nada se guarda hasta confirmar. */
export function ReviewScreen({
  items: initial,
  origin,
  defaultMeal,
  renderPicker,
  onAdd,
  onDone,
  onViewDiary,
  onRetry,
}: Props) {
  const [items, setItems] = useState(initial);
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [pickerFor, setPickerFor] = useState<string | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const update = (key: string, patch: Partial<ReviewItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setMessage(null);
  };

  const rowReady = (item: ReviewItem) =>
    per100gOf(item) !== null &&
    item.grams !== null &&
    item.grams > 0 &&
    item.grams <= MAX_QUANTITY_G;
  const ready = items.length > 0 && items.every(rowReady);

  const kcalOf = (item: ReviewItem) => {
    const per100g = per100gOf(item);
    return per100g && item.grams && item.grams > 0 && item.grams <= MAX_QUANTITY_G
      ? snapshotFromPer100g(per100g, item.grams)
      : null;
  };
  const total = sumSnapshots(items.flatMap((item) => kcalOf(item) ?? []));

  function pick(food: Food) {
    if (pickerFor === 'new') {
      setItems((current) => [
        ...current,
        {
          key: `new-${Date.now()}-${current.length}`,
          query: food.name,
          food,
          guess: null,
          grams: food.portions[0]?.grams ?? 100,
          confidence: 'high',
        },
      ]);
    } else if (pickerFor) {
      update(pickerFor, { food, guess: null });
    }
    setPickerFor(null);
  }

  function submit() {
    if (!ready) return;
    startTransition(async () => {
      const remaining: ReviewItem[] = [];
      const failed: Record<string, string> = {};
      for (const item of items) {
        let food = item.food;
        if (!food && item.guess) {
          const created = await createAiFood({ name: item.query, per100g: item.guess });
          if (!created.ok) {
            failed[item.key] = created.error;
            remaining.push(item);
            continue;
          }
          food = created.food;
        }
        if (!food || item.grams === null) {
          remaining.push(item);
          continue;
        }
        // Todo lo que sale de la IA es una estimación: se marca para que el diario lo muestre con "~".
        const result = await onAdd({
          food,
          quantity_g: item.grams,
          meal_type: meal,
          origin,
          is_estimate: true,
        });
        if (!result.ok) {
          failed[item.key] = result.error;
          remaining.push(item);
        }
      }
      setErrors(failed);
      if (remaining.length === 0) {
        toast.show({
          message: t(r.added, { meal: es.diary.meals[meal].toLowerCase() }),
          tone: 'success',
          action: { label: r.view, onClick: onViewDiary },
        });
        onDone();
      } else {
        setItems(remaining);
        setMessage(t(r.partial, { count: remaining.length }));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{r.title}</h2>
        <p className="text-muted text-sm">{r.help}</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-surface-muted flex flex-col gap-3 rounded-lg p-3">
          <p className="text-sm">{origin === 'ai_text' ? r.emptyText : r.empty}</p>
          <Button variant="secondary" onClick={onRetry}>
            {r.retry}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const name = item.food?.name ?? item.query;
            const snapshot = kcalOf(item);
            return (
              <li
                key={item.key}
                className="border-border flex flex-col gap-2 rounded-xl border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium">{name}</span>
                    <span className="flex flex-wrap gap-1 text-xs">
                      {item.confidence === 'low' ? (
                        <span className="bg-surface-muted text-muted rounded px-1.5 py-0.5">
                          {r.lowConfidence}
                        </span>
                      ) : null}
                      {!item.food && item.guess ? (
                        <span className="bg-surface-muted text-muted rounded px-1.5 py-0.5">
                          {r.unverified}
                        </span>
                      ) : null}
                      {item.food?.source === 'ai_unverified' ? (
                        <span className="bg-surface-muted text-muted rounded px-1.5 py-0.5">
                          {r.unverified}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={t(r.remove, { name })}
                    onClick={() => setItems((current) => current.filter((i) => i.key !== item.key))}
                    className="text-muted -mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>

                {!item.food && !item.guess ? (
                  <p className="text-muted text-sm">
                    {r.noMatch} {r.needsFood}
                  </p>
                ) : null}
                {!item.food && item.guess ? (
                  <p className="text-muted text-xs">{r.unverifiedHelp}</p>
                ) : null}

                <div className="flex items-end gap-3">
                  <NumberInput
                    className="w-32 shrink-0"
                    label={t(r.grams, { name })}
                    unit="g"
                    decimals={1}
                    value={item.grams}
                    onChange={(grams) => update(item.key, { grams })}
                  />
                  <p className="text-muted mb-2 min-w-0 flex-1 text-right text-sm tabular-nums">
                    {snapshot ? t(r.kcal, { kcal: formatNumber(snapshot.kcal, 0) }) : r.needsGrams}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setPickerFor(item.key)}
                >
                  {item.food || item.guess ? r.change : r.choose}
                </Button>
                {errors[item.key] ? (
                  <p role="alert" className="text-danger text-sm">
                    {errors[item.key]}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Button variant="secondary" onClick={() => setPickerFor('new')}>
        {r.addAnother}
      </Button>

      {items.length > 0 ? (
        <>
          <MealSelect label={r.meal} value={meal} onChange={setMeal} />
          <div className="bg-surface-muted flex items-baseline justify-between rounded-lg p-3 tabular-nums">
            <span className="text-sm">{r.total}</span>
            <span className="text-xl font-bold">
              ~{formatNumber(total.kcal, 0)}{' '}
              <span className="text-muted text-sm font-normal">kcal</span>
            </span>
          </div>
          {message ? (
            <p role="alert" className="text-danger text-sm">
              {message}
            </p>
          ) : null}
          <Button size="lg" onClick={submit} loading={pending} disabled={!ready}>
            {pending ? r.submitting : r.submit}
          </Button>
        </>
      ) : null}

      <Sheet
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        title={r.pickerTitle}
        className="max-h-[92dvh] overflow-y-auto"
      >
        {pickerFor !== null ? renderPicker(pick) : null}
      </Sheet>
    </div>
  );
}
