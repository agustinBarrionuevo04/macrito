'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Sheet } from '@/components/ui/sheet';
import { MAX_QUANTITY_G } from '@/features/diary/constants';
import type { DiaryResult } from '@/features/diary/types';
import { MealSelect } from '@/features/diary/components/meal-select';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { EntryDraft, Food, MealType, Origin } from '@/types';
import {
  buildDraft,
  defaultSelection,
  portionText,
  previewNutrition,
  totalGrams,
  type Unit,
} from '../portions';

const p = es.addFood.portion;

type Props = {
  /** `null` = cerrada. */
  food: Food | null;
  origin: Origin;
  defaultMeal: MealType;
  onClose: () => void;
  /** Devuelve el resultado de guardar; si falla, se muestra el error y la hoja sigue abierta. */
  onConfirm: (draft: EntryDraft) => Promise<DiaryResult>;
  /** Alimentos propios se editan; los del catálogo se corrigen (copia propia). */
  onEdit: (food: Food) => void;
  onCorrect: (food: Food) => void;
};

/** Elegir cuánto: gramos o porciones, con la nutrición en vivo y la comida del día. */
export function PortionSheet({
  food,
  origin,
  defaultMeal,
  onClose,
  onConfirm,
  onEdit,
  onCorrect,
}: Props) {
  return (
    <Sheet open={food !== null} onClose={onClose} title={p.title} description={food?.name}>
      {food ? (
        <PortionForm
          key={food.id}
          food={food}
          origin={origin}
          defaultMeal={defaultMeal}
          onClose={onClose}
          onConfirm={onConfirm}
          onEdit={onEdit}
          onCorrect={onCorrect}
        />
      ) : null}
    </Sheet>
  );
}

function PortionForm({
  food,
  origin,
  defaultMeal,
  onClose,
  onConfirm,
  onEdit,
  onCorrect,
}: Omit<Props, 'food'> & { food: Food }) {
  const initial = defaultSelection(food);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [amount, setAmount] = useState<number | null>(initial.amount);
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const grams = totalGrams(food, unit, amount);
  const nutrition = grams === null ? null : previewNutrition(food, grams);
  const own = food.source === 'custom' || food.source === 'ai_unverified';

  function submit() {
    if (grams === null) {
      setError(t(es.diary.errors.quantity, { max: formatNumber(MAX_QUANTITY_G, 0) }));
      return;
    }
    startTransition(async () => {
      const result = await onConfirm(buildDraft({ food, grams, meal, origin }));
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  function changeUnit(value: string) {
    const next: Unit = value === 'g' ? { kind: 'g' } : { kind: 'portion', index: Number(value) };
    setUnit(next);
    // Al pasar de porciones a gramos (o al revés) una cantidad como "2" o "150" no tiene sentido: se reinicia.
    setAmount(next.kind === 'g' ? 100 : 1);
    setError(null);
  }

  const unitId = 'portion-unit';

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-2 items-end gap-3">
        <NumberInput
          label={p.amount}
          decimals={2}
          value={amount}
          onChange={(value) => {
            setAmount(value);
            setError(null);
          }}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={unitId} className="text-sm font-medium">
            {p.unit}
          </label>
          <select
            id={unitId}
            value={unit.kind === 'g' ? 'g' : String(unit.index)}
            onChange={(event) => changeUnit(event.target.value)}
            className="bg-surface border-border focus:border-primary min-h-11 w-full rounded-lg border px-3 text-base outline-none"
          >
            <option value="g">{p.grams}</option>
            {food.portions.map((portion, index) => (
              <option key={`${portion.label}-${index}`} value={String(index)}>
                {portionText(portion)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {unit.kind === 'portion' && grams !== null ? (
        <p className="text-muted text-sm tabular-nums">
          {t(p.total, { grams: formatNumber(grams, 2) })}
        </p>
      ) : null}

      <div className="bg-surface-muted rounded-lg p-3 tabular-nums" aria-live="polite">
        <p className="text-2xl font-bold">
          {nutrition ? formatNumber(nutrition.kcal, 0) : '—'}{' '}
          <span className="text-muted text-sm font-normal">kcal</span>
        </p>
        <p className="text-muted text-sm">
          {nutrition
            ? t(p.macros, {
                protein: `${formatNumber(nutrition.protein_g, 1)} g`,
                carbs: `${formatNumber(nutrition.carbs_g, 1)} g`,
                fat: `${formatNumber(nutrition.fat_g, 1)} g`,
              })
            : ' '}
        </p>
      </div>

      <MealSelect label={p.meal} value={meal} onChange={setMeal} />

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending}>
        {p.add}
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => {
          onClose();
          if (own) onEdit(food);
          else onCorrect(food);
        }}
      >
        {own ? p.edit : p.correct}
      </Button>
    </form>
  );
}
