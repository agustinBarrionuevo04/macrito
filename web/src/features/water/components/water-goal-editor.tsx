'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import { setWaterGoal } from '../actions';
import { WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from '../goal';

const g = es.water.goal;

type Props = {
  /** Meta propia guardada (`null` = usa la sugerida). */
  saved: number | null;
  suggestedMl: number;
};

/** Meta diaria de agua: la propia o la sugerida según el peso. */
export function WaterGoalEditor({ saved, suggestedMl }: Props) {
  const toast = useToast();
  const [value, setValue] = useState<number | null>(saved ?? suggestedMl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(goal: number | null) {
    startTransition(async () => {
      const result = await setWaterGoal(goal);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      if (goal === null) setValue(suggestedMl);
      toast.show({ message: g.saved, tone: 'success' });
    });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (value === null || value < WATER_GOAL_MIN_ML || value > WATER_GOAL_MAX_ML) {
          setError(
            t(es.water.errors.goal, {
              min: formatNumber(WATER_GOAL_MIN_ML, 0),
              max: formatNumber(WATER_GOAL_MAX_ML, 0),
            }),
          );
          return;
        }
        save(Math.round(value));
      }}
    >
      <p className="text-muted text-sm">{g.help}</p>
      <NumberInput
        label={g.label}
        unit="ml"
        decimals={0}
        value={value}
        onChange={(v) => {
          setValue(v);
          setError(null);
        }}
      />
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" loading={pending}>
          {g.save}
        </Button>
        <Button variant="ghost" disabled={saved === null || pending} onClick={() => save(null)}>
          {t(g.useSuggested, { ml: formatNumber(suggestedMl, 0) })}
        </Button>
      </div>
    </form>
  );
}
