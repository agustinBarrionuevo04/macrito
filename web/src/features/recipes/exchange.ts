import {
  EXPORT_VERSION,
  MAX_IMPORT_CHARS,
  exportSchema,
  recipeInputSchema,
  type RecipeInput,
} from './schemas';
import type { RecipeDetail } from './types';

/** La receta como texto para compartir. No incluye ids: se puede importar en otra cuenta. */
export function exportRecipe(
  recipe: Pick<RecipeDetail, 'kind' | 'name' | 'servings' | 'finalWeightG' | 'items'>,
): string {
  return JSON.stringify(
    {
      macritos: EXPORT_VERSION,
      kind: recipe.kind,
      name: recipe.name,
      servings: recipe.servings,
      finalWeightG: recipe.finalWeightG,
      items: recipe.items.map((item) => ({
        name: item.name,
        grams: item.grams,
        kcal_100g: item.kcal_100g,
        protein_100g: item.protein_100g,
        carbs_100g: item.carbs_100g,
        fat_100g: item.fat_100g,
      })),
    },
    null,
    2,
  );
}

export type ImportResult =
  | { ok: true; input: RecipeInput }
  | {
      ok: false;
      reason: 'empty' | 'too_long' | 'not_json' | 'format' | 'invalid';
      message?: string;
    };

/**
 * Lee el texto de una receta exportada y lo valida igual que una receta nueva: nada de lo que viene
 * en el texto se confía (largos, rangos, cantidad de ingredientes).
 */
export function importRecipe(text: string): ImportResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (trimmed.length > MAX_IMPORT_CHARS) return { ok: false, reason: 'too_long' };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const exported = exportSchema.safeParse(raw);
  if (!exported.success) return { ok: false, reason: 'format' };

  const { kind, name, servings, finalWeightG, items } = exported.data;
  const parsed = recipeInputSchema.safeParse({
    kind,
    name,
    servings: servings ?? 1,
    finalWeightG: finalWeightG ?? null,
    items: items.map((item) => ({ ...item, foodId: null })),
  });
  return parsed.success
    ? { ok: true, input: parsed.data }
    : { ok: false, reason: 'invalid', message: parsed.error.issues[0]?.message };
}
