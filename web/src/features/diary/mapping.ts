import { z } from 'zod';
import type { DiaryEntry, Snapshot } from './types';

// PostgREST devuelve `numeric` como número, pero se acepta string por si cambia la serialización.
const numeric = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());

/** Columnas de `intake_entries` que lee la app. */
export const ENTRY_COLUMNS =
  'id, meal_type, food_id, name, quantity_g, kcal, protein_g, carbs_g, fat_g, origin, is_estimate, created_at';

export const entryRowSchema = z.object({
  id: z.string(),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  food_id: z.string().nullable(),
  name: z.string(),
  quantity_g: numeric,
  kcal: numeric,
  protein_g: numeric,
  carbs_g: numeric,
  fat_g: numeric,
  origin: z.enum(['manual', 'barcode', 'search', 'ai_photo', 'ai_text', 'recipe', 'copy']),
  is_estimate: z.boolean(),
  created_at: z.string(),
});

export type EntryRow = z.infer<typeof entryRowSchema>;

export function entryFromRow(row: EntryRow): DiaryEntry {
  return {
    id: row.id,
    mealType: row.meal_type,
    foodId: row.food_id,
    name: row.name,
    quantityG: row.quantity_g,
    kcal: row.kcal,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    origin: row.origin,
    isEstimate: row.is_estimate,
    createdAt: row.created_at,
  };
}

/** Columnas de nutrición de una fila a partir de un snapshot. */
export const nutritionColumns = (s: Snapshot) => ({
  kcal: s.kcal,
  protein_g: s.protein_g,
  carbs_g: s.carbs_g,
  fat_g: s.fat_g,
});
