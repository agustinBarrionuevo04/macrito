'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { UserProfile } from '@/types';
import { updateKcalAdjustment } from '../actions';
import {
  KCAL_ADJUSTMENT_RANGE,
  KCAL_ADJUSTMENT_STEP,
  previewKcalAdjustment,
} from '../kcal-adjustment';

const a = es.nutrients.adjustment;

const signed = (value: number) =>
  value > 0
    ? `+${formatNumber(value, 0)}`
    : value < 0
      ? `−${formatNumber(Math.abs(value), 0)}`
      : '0';

type Props = { profile: UserProfile; today: string };

/** Suma o resta calorías a la meta calculada, con el resultado a la vista antes de guardar. */
export function KcalAdjustmentEditor({ profile, today }: Props) {
  const toast = useToast();
  const saved = profile.kcalAdjustment;
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(
    () => previewKcalAdjustment(profile, value, today),
    [profile, value, today],
  );
  const base = preview ? preview.rawKcal - value : null;
  const change = (delta: number) => {
    setValue((current) =>
      Math.min(Math.max(current + delta, KCAL_ADJUSTMENT_RANGE.min), KCAL_ADJUSTMENT_RANGE.max),
    );
    setError(null);
  };

  function save() {
    startTransition(async () => {
      const result = await updateKcalAdjustment(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.show({ message: a.saved, tone: 'success' });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted text-sm">{a.help}</p>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          aria-label={a.less}
          disabled={value <= KCAL_ADJUSTMENT_RANGE.min}
          onClick={() => change(-KCAL_ADJUSTMENT_STEP)}
        >
          −50
        </Button>
        <p className="text-center text-lg font-semibold tabular-nums" aria-live="polite">
          {value === 0 ? a.none : t(a.value, { value: signed(value) })}
        </p>
        <Button
          variant="secondary"
          aria-label={a.more}
          disabled={value >= KCAL_ADJUSTMENT_RANGE.max}
          onClick={() => change(KCAL_ADJUSTMENT_STEP)}
        >
          +50
        </Button>
      </div>

      {preview && base !== null ? (
        <div
          className="bg-surface-muted flex flex-col gap-1 rounded-xl p-3 text-sm tabular-nums"
          aria-live="polite"
        >
          <p className="font-semibold">{t(a.result, { kcal: formatNumber(preview.kcal, 0) })}</p>
          <p className="text-muted text-xs">
            {t(a.breakdown, {
              base: formatNumber(base, 0),
              sign: value < 0 ? '−' : '+',
              adjustment: formatNumber(Math.abs(value), 0),
            })}
          </p>
          {preview.warnings.some((w) => w.code === 'below_kcal_floor') ? (
            <p className="text-muted text-xs">
              {t(es.profile.warnings.below_kcal_floor, {
                raw: formatNumber(preview.rawKcal, 0),
                floor: formatNumber(preview.floorKcal, 0),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button className="flex-1" loading={pending} disabled={value === saved} onClick={save}>
          {a.save}
        </Button>
        <Button
          variant="ghost"
          disabled={value === 0 || pending}
          onClick={() => {
            setValue(0);
            setError(null);
          }}
        >
          {a.reset}
        </Button>
      </div>
    </div>
  );
}
