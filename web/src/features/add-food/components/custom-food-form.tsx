'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Sheet } from '@/components/ui/sheet';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { Food } from '@/types';
import { createCustomFood, updateCustomFood } from '../actions';
import {
  MAX_BRAND_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PORTION_LABEL_LENGTH,
  MAX_PORTIONS,
} from '../constants';
import { customFoodSchema } from '../schemas';

const c = es.addFood.custom;

/** Valores del formulario tal como se escriben (texto o número, vacío = `null`). */
export type CustomFoodValues = {
  name: string;
  brand: string;
  barcode: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  portions: { label: string; grams: number | null }[];
};

export const emptyValues = (overrides: Partial<CustomFoodValues> = {}): CustomFoodValues => ({
  name: '',
  brand: '',
  barcode: '',
  kcal: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  fiber_g: null,
  sugar_g: null,
  sodium_mg: null,
  portions: [],
  ...overrides,
});

/** Precarga el formulario con un alimento existente (para editarlo o para corregirlo). */
export function valuesFromFood(food: Food): CustomFoodValues {
  return {
    name: food.name,
    brand: food.brand ?? '',
    barcode: food.barcode ?? '',
    kcal: food.per100g.kcal,
    protein_g: food.per100g.protein_g,
    carbs_g: food.per100g.carbs_g,
    fat_g: food.per100g.fat_g,
    fiber_g: food.per100g.fiber_g ?? null,
    sugar_g: food.per100g.sugar_g ?? null,
    sodium_mg: food.per100g.sodium_mg ?? null,
    portions: food.portions.map((portion) => ({ ...portion })),
  };
}

/** Lo que valida el esquema: los vacíos pasan como `undefined`. */
function toInput(values: CustomFoodValues) {
  const num = (value: number | null) => value ?? undefined;
  return {
    name: values.name,
    brand: values.brand,
    barcode: values.barcode,
    kcal: num(values.kcal),
    protein_g: num(values.protein_g),
    carbs_g: num(values.carbs_g),
    fat_g: num(values.fat_g),
    fiber_g: num(values.fiber_g),
    sugar_g: num(values.sugar_g),
    sodium_mg: num(values.sodium_mg),
    portions: values.portions.map((portion) => ({
      label: portion.label,
      grams: portion.grams ?? Number.NaN,
    })),
  };
}

export type CustomFoodMode =
  | { kind: 'create'; values: CustomFoodValues }
  | { kind: 'correct'; values: CustomFoodValues }
  | { kind: 'edit'; foodId: string; values: CustomFoodValues };

type Props = {
  /** `null` = cerrado. */
  mode: CustomFoodMode | null;
  onClose: () => void;
  /** El alimento ya está guardado: sigue la elección de la cantidad. */
  onSaved: (food: Food) => void;
};

const TITLES = { create: c.createTitle, correct: c.correctTitle, edit: c.editTitle };

export function CustomFoodForm({ mode, onClose, onSaved }: Props) {
  return (
    <Sheet
      open={mode !== null}
      onClose={onClose}
      title={mode ? TITLES[mode.kind] : c.createTitle}
      description={mode?.kind === 'correct' ? c.correctHelp : c.help}
      className="max-h-[92dvh] overflow-y-auto"
    >
      {mode ? <FormBody key={JSON.stringify(mode)} mode={mode} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function FormBody({ mode, onSaved }: { mode: CustomFoodMode; onSaved: (food: Food) => void }) {
  const [values, setValues] = useState<CustomFoodValues>(mode.values);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<CustomFoodValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError(null);
  };

  function submit() {
    const input = toInput(values);
    const parsed = customFoodSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? c.errors.generic);
      return;
    }
    startTransition(async () => {
      const result =
        mode.kind === 'edit'
          ? await updateCustomFood(mode.foodId, input)
          : await createCustomFood(input);
      if (result.ok) onSaved(result.food);
      else setError(result.error);
    });
  }

  const textInput = (
    id: string,
    label: string,
    value: string,
    max: number,
    onChange: (v: string) => void,
    extra = '',
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {extra}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={max}
        onChange={(event) => onChange(event.target.value)}
        className="bg-surface border-border focus:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
      />
    </div>
  );

  const optional = ` (${c.optional})`;

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {textInput('food-name', c.name, values.name, MAX_NAME_LENGTH, (name) => set({ name }))}
      {textInput(
        'food-brand',
        c.brand,
        values.brand,
        MAX_BRAND_LENGTH,
        (brand) => set({ brand }),
        optional,
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">{c.per100}</legend>
        <NumberInput
          label={c.kcal}
          unit="kcal"
          decimals={1}
          value={values.kcal}
          onChange={(kcal) => set({ kcal })}
        />
        <div className="grid grid-cols-3 gap-2">
          <NumberInput
            label={c.protein}
            unit="g"
            decimals={1}
            value={values.protein_g}
            onChange={(protein_g) => set({ protein_g })}
          />
          <NumberInput
            label={c.carbs}
            unit="g"
            decimals={1}
            value={values.carbs_g}
            onChange={(carbs_g) => set({ carbs_g })}
          />
          <NumberInput
            label={c.fat}
            unit="g"
            decimals={1}
            value={values.fat_g}
            onChange={(fat_g) => set({ fat_g })}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <NumberInput
            label={`${c.fiber}`}
            unit="g"
            decimals={1}
            value={values.fiber_g}
            onChange={(fiber_g) => set({ fiber_g })}
          />
          <NumberInput
            label={c.sugar}
            unit="g"
            decimals={1}
            value={values.sugar_g}
            onChange={(sugar_g) => set({ sugar_g })}
          />
          <NumberInput
            label={c.sodium}
            unit="mg"
            decimals={0}
            value={values.sodium_mg}
            onChange={(sodium_mg) => set({ sodium_mg })}
          />
        </div>
        <p className="text-muted -mt-1 text-xs">
          {c.fiber}, {c.sugar.toLowerCase()} y {c.sodium.toLowerCase()}: {c.optional}.
        </p>
      </fieldset>

      {textInput(
        'food-barcode',
        c.barcode,
        values.barcode,
        20,
        (barcode) => set({ barcode }),
        optional,
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">{c.portionsTitle}</legend>
        <p className="text-muted -mt-1 text-xs">{c.portionsHelp}</p>
        {values.portions.map((portion, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={`portion-label-${index}`} className="text-sm font-medium">
                {c.portionLabel}
              </label>
              <input
                id={`portion-label-${index}`}
                type="text"
                value={portion.label}
                maxLength={MAX_PORTION_LABEL_LENGTH}
                onChange={(event) =>
                  set({
                    portions: values.portions.map((p, i) =>
                      i === index ? { ...p, label: event.target.value } : p,
                    ),
                  })
                }
                className="bg-surface border-border focus:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
              />
            </div>
            <NumberInput
              className="w-28 shrink-0"
              label={c.portionGrams}
              unit="g"
              decimals={1}
              value={portion.grams}
              onChange={(grams) =>
                set({
                  portions: values.portions.map((p, i) => (i === index ? { ...p, grams } : p)),
                })
              }
            />
            <button
              type="button"
              aria-label={t(c.portionRemove, { label: portion.label || String(index + 1) })}
              onClick={() => set({ portions: values.portions.filter((_, i) => i !== index) })}
              className="text-muted inline-flex size-11 shrink-0 items-center justify-center rounded-lg"
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
        ))}
        {values.portions.length < MAX_PORTIONS ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => set({ portions: [...values.portions, { label: '', grams: null }] })}
          >
            {c.portionAdd}
          </Button>
        ) : (
          <p className="text-muted text-xs">
            {t(c.errors.portionsMax, { max: formatNumber(MAX_PORTIONS, 0) })}
          </p>
        )}
      </fieldset>

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending}>
        {c.save}
      </Button>
    </form>
  );
}
