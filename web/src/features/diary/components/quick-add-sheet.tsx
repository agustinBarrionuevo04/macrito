'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import type { MealType } from '@/types';
import { addQuickEntry } from '../actions';
import { MAX_NAME_LENGTH } from '../constants';
import { MealSelect } from './meal-select';

const q = es.diary.quickAdd;

type Props = { open: boolean; onClose: () => void; day: string; defaultMeal: MealType };

/** Calorías rápidas: se carga un valor conocido sin buscar un alimento. */
export function QuickAddSheet({ open, onClose, day, defaultMeal }: Props) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function reset() {
    setName('');
    setKcal(null);
    setProtein(null);
    setCarbs(null);
    setFat(null);
    setError(null);
  }

  function submit() {
    if (kcal === null || kcal <= 0) {
      setError(es.diary.errors.kcal);
      return;
    }
    startTransition(async () => {
      const result = await addQuickEntry(
        {
          name: name.trim() || undefined,
          kcal,
          protein_g: protein ?? undefined,
          carbs_g: carbs ?? undefined,
          fat_g: fat ?? undefined,
          meal_type: meal,
        },
        day,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show({
        message: t(q.added, { meal: es.diary.meals[meal].toLowerCase() }),
        tone: 'success',
      });
      reset();
      onClose();
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={q.title} description={q.description}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="quick-name" className="text-sm font-medium">
            {q.name} <span className="text-muted font-normal">({q.optional})</span>
          </label>
          <input
            id="quick-name"
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder={q.namePlaceholder}
            onChange={(event) => setName(event.target.value)}
            className="bg-surface border-border focus:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
          />
        </div>

        <NumberInput
          label={q.kcal}
          unit="kcal"
          decimals={0}
          value={kcal}
          onChange={(value) => {
            setKcal(value);
            setError(null);
          }}
        />

        <div className="grid grid-cols-3 gap-2">
          <NumberInput
            label={q.protein}
            unit="g"
            decimals={1}
            value={protein}
            onChange={setProtein}
          />
          <NumberInput label={q.carbs} unit="g" decimals={1} value={carbs} onChange={setCarbs} />
          <NumberInput label={q.fat} unit="g" decimals={1} value={fat} onChange={setFat} />
        </div>
        <p className="text-muted -mt-1 text-xs">({q.optional})</p>

        <MealSelect label={q.meal} value={meal} onChange={setMeal} />

        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={pending}>
          {q.submit}
        </Button>
      </form>
    </Sheet>
  );
}
