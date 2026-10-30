import { z } from 'zod';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { isValidDay } from './dates';
import { MAX_NAME_LENGTH, MAX_QUANTITY_G, MAX_QUICK_KCAL, MAX_QUICK_MACRO_G } from './constants';

const e = es.diary.errors;

export const dayInput = z.string().refine(isValidDay, e.invalidDay);
export const idInput = z.guid(e.generic);
export const mealInput = z.enum(['breakfast', 'lunch', 'snack', 'dinner'], e.generic);

const quantityInput = z
  .number(t(e.quantity, { max: MAX_QUANTITY_G }))
  .gt(0, t(e.quantity, { max: MAX_QUANTITY_G }))
  .max(MAX_QUANTITY_G, t(e.quantity, { max: MAX_QUANTITY_G }));

const originInput = z.enum(
  ['manual', 'barcode', 'search', 'ai_photo', 'ai_text', 'recipe'],
  e.generic,
);

/** Tope de sanidad para valores ya guardados (10 kg de aceite son unas 88.000 kcal). */
const MAX_STORED_NUTRIENT = 1_000_000;

const macroInput = z.number(e.macro).min(0, e.macro).max(MAX_QUICK_MACRO_G, e.macro);

/**
 * `EntryDraft` del contrato. Del alimento solo se usa el `id`: los valores nutricionales se leen de
 * la base, así el cliente no puede mandar calorías inventadas para un alimento real.
 */
export const entryDraftSchema = z.object({
  food: z.object({ id: idInput }),
  quantity_g: quantityInput,
  meal_type: mealInput,
  origin: originInput,
  is_estimate: z.boolean(),
});

export const quickEntrySchema = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_NAME_LENGTH, t(e.name, { max: MAX_NAME_LENGTH }))
    .optional(),
  kcal: z.number(e.kcal).gt(0, e.kcal).max(MAX_QUICK_KCAL, e.kcal),
  protein_g: macroInput.optional(),
  carbs_g: macroInput.optional(),
  fat_g: macroInput.optional(),
  meal_type: mealInput,
});

export const entryPatchSchema = z
  .object({ quantity_g: quantityInput.optional(), meal_type: mealInput.optional() })
  .refine((patch) => patch.quantity_g !== undefined || patch.meal_type !== undefined, {
    message: e.nothingToChange,
  });

/** Entrada eliminada, tal como la devuelve la pantalla para deshacer. */
export const restoreSchema = z.object({
  day: dayInput,
  mealType: mealInput,
  foodId: idInput.nullable(),
  name: z.string().max(200),
  quantityG: z.number().min(0).max(MAX_QUANTITY_G),
  kcal: z.number().min(0).max(MAX_STORED_NUTRIENT),
  protein_g: z.number().min(0).max(MAX_STORED_NUTRIENT),
  carbs_g: z.number().min(0).max(MAX_STORED_NUTRIENT),
  fat_g: z.number().min(0).max(MAX_STORED_NUTRIENT),
  origin: z.enum(['manual', 'barcode', 'search', 'ai_photo', 'ai_text', 'recipe', 'copy']),
  isEstimate: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const copySchema = z.object({
  source: z.discriminatedUnion('scope', [
    z.object({ scope: z.literal('entry'), id: idInput }),
    z.object({ scope: z.literal('meal'), day: dayInput, mealType: mealInput }),
    z.object({ scope: z.literal('day'), day: dayInput }),
  ]),
  toDay: dayInput,
  /** Solo para copiar una entrada: en qué comida queda. Si falta, queda en la misma. */
  toMeal: mealInput.optional(),
});

export type EntryPatch = z.infer<typeof entryPatchSchema>;
export type QuickEntryInput = z.infer<typeof quickEntrySchema>;
export type RestoreInput = z.infer<typeof restoreSchema>;
export type CopyInput = z.infer<typeof copySchema>;
