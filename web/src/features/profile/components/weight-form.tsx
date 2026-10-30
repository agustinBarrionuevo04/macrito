'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { logWeight } from '../actions';
import { weightIssue } from '../validation';

/** Registra el peso de hoy: queda en el historial y actualiza el peso del perfil. */
export function WeightForm({ currentWeightKg }: { currentWeightKg: number }) {
  const [weightKg, setWeightKg] = useState<number | null>(currentWeightKg);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function save() {
    const problem = weightIssue(weightKg);
    if (problem || weightKg === null) {
      setError(problem ?? es.profile.errors.generic);
      return;
    }
    startTransition(async () => {
      const result = await logWeight({ weightKg });
      if (result.ok) {
        setError(null);
        toast.show({ message: es.profile.page.weightSaved, tone: 'success' });
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      className="flex items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <NumberInput
        className="min-w-0 flex-1"
        label={es.profile.page.weightToday}
        unit="kg"
        decimals={1}
        value={weightKg}
        onChange={(value) => {
          setWeightKg(value);
          setError(null);
        }}
        error={error ?? undefined}
      />
      <Button type="submit" loading={pending} className="mb-0">
        {es.profile.save}
      </Button>
    </form>
  );
}
