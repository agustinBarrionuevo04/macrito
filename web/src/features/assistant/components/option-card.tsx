'use client';

import { Button } from '@/components/ui/button';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { PlanOption } from '../types';

const a = es.assistant;

type Props = {
  option: PlanOption;
  index: number;
  added: boolean;
  pending: boolean;
  /** En el modo "día" se muestra a qué comida va cada opción. */
  showMeal: boolean;
  onAdd: () => void;
};

/** Una opción de comida: sus alimentos con gramos y calorías, el total y el botón de un toque. */
export function OptionCard({ option, index, added, pending, showMeal, onAdd }: Props) {
  const meal = es.diary.meals[option.meal];
  const totals = option.totals;
  return (
    <li className="bg-surface border-border flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <p className="text-muted text-xs font-medium">
          {showMeal ? meal : t(a.optionLabel, { n: index + 1 })}
        </p>
        <h3 className="text-base font-semibold">{option.title}</h3>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {option.items.map((item, i) => (
          <li key={`${item.food.id}-${i}`} className="flex justify-between gap-3">
            <span>{item.food.name}</span>
            <span className="text-muted shrink-0 tabular-nums">
              {t(a.itemLine, {
                grams: formatNumber(item.grams, 0),
                kcal: formatNumber(item.nutrition.kcal, 0),
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium tabular-nums">
        {t(a.totals, {
          kcal: formatNumber(totals.kcal, 0),
          protein: formatNumber(totals.protein_g, 0),
          carbs: formatNumber(totals.carbs_g, 0),
          fat: formatNumber(totals.fat_g, 0),
        })}
      </p>
      <Button
        variant={added ? 'secondary' : 'primary'}
        disabled={added}
        loading={pending}
        onClick={onAdd}
      >
        {added ? a.addedDone : t(a.addTo, { meal: meal.toLowerCase() })}
      </Button>
    </li>
  );
}
