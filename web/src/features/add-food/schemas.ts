import { z } from 'zod';
import { normalizeBarcode } from '@/lib/foods/barcode';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import {
  MAX_BRAND_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PORTION_GRAMS,
  MAX_PORTION_LABEL_LENGTH,
  MAX_PORTIONS,
  MAX_SODIUM_MG,
} from './constants';

const e = es.addFood.custom.errors;

const kcal = z.number(e.kcal).min(0, e.kcal).max(900, e.kcal);
const macro = z.number(e.macro).min(0, e.macro).max(100, e.macro);
const optionalValue = (max: number) =>
  z.number(e.optional).min(0, e.optional).max(max, e.optional).optional();

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const portionSchema = z.object({
  label: z
    .string(e.portionLabel)
    .trim()
    .min(1, e.portionLabel)
    .max(MAX_PORTION_LABEL_LENGTH, e.portionLabel),
  grams: z
    .number(t(e.portionGrams, { max: MAX_PORTION_GRAMS }))
    .gt(0, t(e.portionGrams, { max: MAX_PORTION_GRAMS }))
    .max(MAX_PORTION_GRAMS, t(e.portionGrams, { max: MAX_PORTION_GRAMS })),
});

/** Alimento propio: valores por 100 g. */
export const customFoodSchema = z
  .object({
    name: z
      .string(t(e.name, { max: MAX_NAME_LENGTH }))
      .trim()
      .min(1, t(e.name, { max: MAX_NAME_LENGTH }))
      .max(MAX_NAME_LENGTH, t(e.name, { max: MAX_NAME_LENGTH })),
    brand: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .max(MAX_BRAND_LENGTH, t(e.brand, { max: MAX_BRAND_LENGTH }))
        .optional(),
    ),
    barcode: z.preprocess(
      blankToUndefined,
      z
        .string()
        .transform((raw, ctx) => {
          const code = normalizeBarcode(raw);
          if (!code) ctx.addIssue({ code: 'custom', message: e.barcode });
          return code ?? '';
        })
        .optional(),
    ),
    kcal,
    protein_g: macro,
    carbs_g: macro,
    fat_g: macro,
    fiber_g: optionalValue(100),
    sugar_g: optionalValue(100),
    sodium_mg: optionalValue(MAX_SODIUM_MG),
    portions: z
      .array(portionSchema)
      .max(MAX_PORTIONS, t(e.portionsMax, { max: MAX_PORTIONS }))
      .default([]),
  })
  .refine((food) => food.protein_g + food.carbs_g + food.fat_g <= 105, {
    message: e.macroSum,
    path: ['fat_g'],
  });

export type CustomFoodInput = z.infer<typeof customFoodSchema>;

export const foodIdSchema = z.guid();
