'use client';

import { useId } from 'react';
import { es } from '@/lib/i18n/es';
import type { MealType } from '@/types';
import { MEAL_ORDER } from '../types';

type Props = {
  label: string;
  value: MealType;
  onChange: (meal: MealType) => void;
  className?: string;
};

/** Selector de la comida del día (desayuno, almuerzo, merienda, cena). */
export function MealSelect({ label, value, onChange, className }: Props) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as MealType)}
        className="bg-surface border-border focus:border-primary min-h-11 w-full rounded-lg border px-3 text-base outline-none"
      >
        {MEAL_ORDER.map((meal) => (
          <option key={meal} value={meal}>
            {es.diary.meals[meal]}
          </option>
        ))}
      </select>
    </div>
  );
}
