'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import type { MealType } from '@/types';
import { saveMealAsCombo } from '../actions';

const m = es.recipes.repeat;

type Props = {
  /** `null` = cerrada. */
  meal: MealType | null;
  day: string;
  onClose: () => void;
};

/** Guarda una comida del diario como comida frecuente. */
export function SaveComboSheet({ meal, day, onClose }: Props) {
  return (
    <Sheet
      open={meal !== null}
      onClose={onClose}
      title={
        meal
          ? es.recipes.repeat.saveAsCombo.replace('{meal}', es.diary.meals[meal].toLowerCase())
          : ''
      }
    >
      {meal ? <Form key={`${day}-${meal}`} meal={meal} day={day} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Form({ meal, day, onClose }: { meal: MealType; day: string; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState<string>(es.diary.meals[meal]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveMealAsCombo({ day, mealType: meal, name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show({ message: m.comboSaved, tone: 'success' });
      onClose();
    });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="combo-name" className="text-sm font-medium">
          {m.comboName}
        </label>
        <input
          id="combo-name"
          type="text"
          value={name}
          maxLength={100}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          className="bg-surface border-border focus:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
        />
      </div>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={pending}>
        {es.recipes.editor.save}
      </Button>
    </form>
  );
}
