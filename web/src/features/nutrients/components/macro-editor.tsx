'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { cx } from '@/lib/ui/cx';
import { formatNumber } from '@/lib/ui/number';
import type { UserProfile } from '@/types';
import { updateMacros } from '../actions';
import {
  PROTEIN_G_PER_KG_RANGE,
  macroEditFromProfile,
  macroEditIssue,
  previewMacroEdit,
  type MacroEdit,
} from '../macro-edit';

const m = es.nutrients.macros;

type Mode = MacroEdit['mode'];
const MODES: Mode[] = ['default', 'percent', 'g_per_kg'];

type Props = { profile: UserProfile; today: string };

/** Edita cómo se reparten las calorías entre macros, con la meta resultante en vivo antes de guardar. */
export function MacroEditor({ profile, today }: Props) {
  const toast = useToast();
  const groupId = useId();
  const initial = useMemo(() => macroEditFromProfile(profile), [profile]);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [percent, setPercent] = useState<{
    carbs: number | null;
    fat: number | null;
    protein: number | null;
  }>(
    initial.mode === 'percent'
      ? { carbs: initial.carbs, fat: initial.fat, protein: initial.protein }
      : { carbs: 50, fat: 30, protein: 20 },
  );
  const [perKg, setPerKg] = useState<number | null>(
    initial.mode === 'g_per_kg' ? initial.proteinGPerKg : 1.8,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const edit = useMemo<MacroEdit>(() => {
    const nan = Number.NaN;
    if (mode === 'default') return { mode: 'default' };
    if (mode === 'percent') {
      return {
        mode: 'percent',
        carbs: percent.carbs ?? nan,
        fat: percent.fat ?? nan,
        protein: percent.protein ?? nan,
      };
    }
    return { mode: 'g_per_kg', proteinGPerKg: perKg ?? nan };
  }, [mode, percent, perKg]);

  const sum =
    mode === 'percent'
      ? Math.round(((percent.carbs ?? 0) + (percent.fat ?? 0) + (percent.protein ?? 0)) * 10) / 10
      : 100;
  const issue = macroEditIssue(edit);
  const current = useMemo(
    () => previewMacroEdit(profile, initial, today),
    [profile, initial, today],
  );
  const preview = useMemo(() => previewMacroEdit(profile, edit, today), [profile, edit, today]);

  function issueMessage() {
    if (!issue) return null;
    return t(m.errors[issue], {
      sum: formatNumber(sum, 1),
      min: formatNumber(PROTEIN_G_PER_KG_RANGE.min, 1),
      max: formatNumber(PROTEIN_G_PER_KG_RANGE.max, 1),
    });
  }

  function save() {
    const message = issueMessage();
    if (message) {
      setError(message);
      return;
    }
    startTransition(async () => {
      const result = await updateMacros(edit);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.show({ message: m.saved, tone: 'success' });
    });
  }

  const grams = (value: number | undefined) => t(m.grams, { value: formatNumber(value ?? 0, 0) });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="text-muted text-sm">{m.help}</p>

      <div
        role="radiogroup"
        aria-label={m.title}
        className="bg-surface-muted grid grid-cols-3 gap-1 rounded-xl p-1"
      >
        {MODES.map((id) => (
          <label
            key={id}
            className={cx(
              'flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-1 text-center text-xs font-medium',
              mode === id ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
            )}
          >
            <input
              type="radio"
              name={groupId}
              value={id}
              checked={mode === id}
              onChange={() => {
                setMode(id);
                setError(null);
              }}
              className="sr-only"
            />
            {m.modes[id]}
          </label>
        ))}
      </div>

      {mode === 'default' ? <p className="text-muted text-sm">{m.defaultHelp}</p> : null}

      {mode === 'percent' ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <NumberInput
              label={m.carbs}
              unit="%"
              decimals={1}
              value={percent.carbs}
              onChange={(carbs) => {
                setPercent((p) => ({ ...p, carbs }));
                setError(null);
              }}
            />
            <NumberInput
              label={m.fat}
              unit="%"
              decimals={1}
              value={percent.fat}
              onChange={(fat) => {
                setPercent((p) => ({ ...p, fat }));
                setError(null);
              }}
            />
            <NumberInput
              label={m.protein}
              unit="%"
              decimals={1}
              value={percent.protein}
              onChange={(protein) => {
                setPercent((p) => ({ ...p, protein }));
                setError(null);
              }}
            />
          </div>
          <p
            className={cx(
              'text-sm tabular-nums',
              issue === 'percent_sum' ? 'text-danger' : 'text-muted',
            )}
            aria-live="polite"
          >
            {t(m.sum, { sum: formatNumber(sum, 1) })}
          </p>
        </div>
      ) : null}

      {mode === 'g_per_kg' ? (
        <div className="flex flex-col gap-2">
          <NumberInput
            label={m.perKg}
            unit="g/kg"
            decimals={2}
            value={perKg}
            onChange={(v) => {
              setPerKg(v);
              setError(null);
            }}
          />
          <p className="text-muted text-xs">
            {t(m.perKgHelp, {
              min: formatNumber(PROTEIN_G_PER_KG_RANGE.min, 1),
              max: formatNumber(PROTEIN_G_PER_KG_RANGE.max, 1),
            })}
          </p>
        </div>
      ) : null}

      {issue && mode !== 'default' && !error ? (
        <p className="text-danger text-sm">{issueMessage()}</p>
      ) : null}

      {preview ? (
        <section
          aria-label={m.preview}
          className="bg-surface-muted flex flex-col gap-1 rounded-xl p-3 text-sm tabular-nums"
          aria-live="polite"
        >
          <p className="font-semibold">{m.preview}</p>
          <p>
            {formatNumber(preview.kcal, 0)} kcal · {m.protein} {grams(preview.protein_g)} ·{' '}
            {m.carbs} {grams(preview.carbs_g)} · {m.fat} {grams(preview.fat_g)}
          </p>
          {current ? (
            <p className="text-muted text-xs">
              {m.current}: {m.protein} {grams(current.protein_g)} · {m.carbs}{' '}
              {grams(current.carbs_g)} · {m.fat} {grams(current.fat_g)}
            </p>
          ) : null}
          {preview.warnings.some((warning) => warning.code === 'protein_capped') ? (
            <p className="text-muted text-xs">{es.profile.warnings.protein_capped}</p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" loading={pending} disabled={issue !== null}>
        {m.save}
      </Button>
    </form>
  );
}
