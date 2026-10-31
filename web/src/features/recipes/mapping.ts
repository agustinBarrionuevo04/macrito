import { z } from 'zod';
import type { Ingredient, RecipeDetail, RecipeSummary } from './types';
import { recipeNutrition } from './nutrition';

const numeric = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());

const recipeRow = z.object({
  id: z.string(),
  kind: z.enum(['recipe', 'combo']),
  name: z.string(),
  servings: numeric,
  final_weight_g: numeric.nullish().transform((v) => v ?? null),
  food_id: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});

const itemRow = z.object({
  recipe_id: z.string().optional(),
  position: numeric.optional(),
  food_id: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  name: z.string(),
  grams: numeric,
  kcal_100g: numeric,
  protein_100g: numeric,
  carbs_100g: numeric,
  fat_100g: numeric,
});

export const RECIPE_COLUMNS = 'id, kind, name, servings, final_weight_g, food_id';
export const ITEM_COLUMNS =
  'recipe_id, position, food_id, name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g';

type ParsedItem = z.infer<typeof itemRow>;

function ingredientFrom(row: ParsedItem): Ingredient {
  return {
    foodId: row.food_id,
    name: row.name,
    grams: row.grams,
    kcal_100g: row.kcal_100g,
    protein_100g: row.protein_100g,
    carbs_100g: row.carbs_100g,
    fat_100g: row.fat_100g,
  };
}

export function parseItems(
  rows: unknown,
): { recipeId: string | undefined; position: number; item: Ingredient }[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = itemRow.safeParse(row);
    return parsed.success
      ? [
          {
            recipeId: parsed.data.recipe_id,
            position: parsed.data.position ?? 0,
            item: ingredientFrom(parsed.data),
          },
        ]
      : [];
  });
}

export function parseRecipe(row: unknown, items: Ingredient[]): RecipeDetail | null {
  const parsed = recipeRow.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    servings: r.servings,
    finalWeightG: r.final_weight_g,
    foodId: r.food_id,
    items,
  };
}

/** Lista de recetas con sus ingredientes agrupados y las kcal por porción (o del combo entero). */
export function parseSummaries(recipes: unknown, items: unknown): RecipeSummary[] {
  const byRecipe = new Map<string, { position: number; item: Ingredient }[]>();
  for (const { recipeId, position, item } of parseItems(items)) {
    if (!recipeId) continue;
    byRecipe.set(recipeId, [...(byRecipe.get(recipeId) ?? []), { position, item }]);
  }
  if (!Array.isArray(recipes)) return [];
  return recipes.flatMap((row) => {
    const recipe = parseRecipe(row, []);
    if (!recipe) return [];
    const ingredients = (byRecipe.get(recipe.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((x) => x.item);
    const nutrition = recipeNutrition(ingredients, recipe.servings, recipe.finalWeightG);
    return [
      {
        id: recipe.id,
        kind: recipe.kind,
        name: recipe.name,
        servings: recipe.servings,
        finalWeightG: recipe.finalWeightG,
        foodId: recipe.foodId,
        itemCount: ingredients.length,
        kcal: Math.round(
          recipe.kind === 'combo' ? nutrition.totals.kcal : nutrition.perServing.kcal,
        ),
      },
    ];
  });
}

export { itemRow as itemRowSchema };
