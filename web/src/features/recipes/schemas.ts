import { z } from 'zod';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';

const e = es.recipes.errors;

export const MAX_INGREDIENTS = 40;
export const MAX_NAME = 100;
export const MAX_SERVINGS = 100;
export const MAX_GRAMS = 10_000;
export const MAX_FINAL_WEIGHT = 50_000;
/** Tamaño máximo del texto al importar: una receta de 40 ingredientes pesa menos de 10 KB. */
export const MAX_IMPORT_CHARS = 30_000;

const idSchema = z.guid();

const positive = (max: number, message: string) =>
  z.number(message).gt(0, message).max(max, message);

export const ingredientSchema = z.object({
  foodId: idSchema.nullish().transform((value) => value ?? null),
  name: z.string(e.ingredientName).trim().min(1, e.ingredientName).max(200, e.ingredientName),
  grams: positive(MAX_GRAMS, t(e.grams, { max: MAX_GRAMS })),
  // Con `foodId` el servidor vuelve a leer estos valores de la base; sin él (recetas importadas) se usan tal cual.
  kcal_100g: z.number(e.values).min(0, e.values).max(900, e.values),
  protein_100g: z.number(e.values).min(0, e.values).max(100, e.values),
  carbs_100g: z.number(e.values).min(0, e.values).max(100, e.values),
  fat_100g: z.number(e.values).min(0, e.values).max(100, e.values),
});

export const recipeInputSchema = z.object({
  kind: z.enum(['recipe', 'combo'], e.generic),
  name: z
    .string(t(e.name, { max: MAX_NAME }))
    .trim()
    .min(1, t(e.name, { max: MAX_NAME }))
    .max(MAX_NAME, t(e.name, { max: MAX_NAME })),
  servings: positive(MAX_SERVINGS, t(e.servings, { max: MAX_SERVINGS })).default(1),
  finalWeightG: positive(MAX_FINAL_WEIGHT, t(e.finalWeight, { max: MAX_FINAL_WEIGHT }))
    .nullish()
    .transform((value) => value ?? null),
  items: z
    .array(ingredientSchema, e.items)
    .min(1, e.items)
    .max(MAX_INGREDIENTS, t(e.itemsMax, { max: MAX_INGREDIENTS })),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;

/** Formato de intercambio (copiar e importar). Versionado para poder cambiarlo sin romper lo viejo. */
export const EXPORT_VERSION = 1;

export const exportSchema = z.object({
  macritos: z.literal(EXPORT_VERSION),
  kind: z.enum(['recipe', 'combo']),
  name: z.string(),
  servings: z.number().optional(),
  finalWeightG: z.number().nullish(),
  items: z.array(
    z.object({
      name: z.string(),
      grams: z.number(),
      kcal_100g: z.number(),
      protein_100g: z.number(),
      carbs_100g: z.number(),
      fat_100g: z.number(),
    }),
  ),
});
export type RecipeExport = z.infer<typeof exportSchema>;

export const recipeIdSchema = idSchema;
