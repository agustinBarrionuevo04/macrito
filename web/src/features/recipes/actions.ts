'use server';

import { revalidatePath } from 'next/cache';
import { snapshotFromPer100g } from '@/features/diary/snapshot';
import { dayInput, mealInput } from '@/features/diary/schemas';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { createClient } from '@/lib/supabase/server';
import { importRecipe } from './exchange';
import { ITEM_COLUMNS, RECIPE_COLUMNS, parseItems, parseRecipe } from './mapping';
import { recipeNutrition, SERVING_LABEL } from './nutrition';
import { MAX_NAME, recipeIdSchema, recipeInputSchema, type RecipeInput } from './schemas';
import type { RecipeDetail } from './types';

const e = es.recipes.errors;

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentUserId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const firstMessage = (error: { issues: { message: string }[] }) =>
  error.issues[0]?.message ?? e.generic;
const done = () => {
  revalidatePath('/recipes');
  revalidatePath('/add');
};

/**
 * Guarda una receta o combo en un solo paso (función SQL atómica). Los valores por 100 g de la receta
 * se calculan acá, con el mismo código que prueba la pantalla; la base solo los guarda. Los de cada
 * ingrediente son un snapshot que manda el cliente (son datos propios, como un alimento propio).
 */
async function persist(
  supabase: Supabase,
  id: string | null,
  input: RecipeInput,
): Promise<Result<{ id: string }>> {
  const isRecipe = input.kind === 'recipe';
  const servings = isRecipe ? input.servings : 1;
  const finalWeightG = isRecipe ? input.finalWeightG : null;
  const nutrition = recipeNutrition(input.items, servings, finalWeightG);
  if (isRecipe && !nutrition.plausible) return fail(e.implausible);

  const { data, error } = await supabase.rpc('save_recipe', {
    p_id: id,
    p_recipe: { kind: input.kind, name: input.name, servings, final_weight_g: finalWeightG },
    p_items: input.items.map((item) => ({
      food_id: item.foodId,
      name: item.name,
      grams: item.grams,
      kcal_100g: item.kcal_100g,
      protein_100g: item.protein_100g,
      carbs_100g: item.carbs_100g,
      fat_100g: item.fat_100g,
    })),
    p_food: isRecipe
      ? {
          name: input.name,
          kcal_100g: nutrition.per100g.kcal,
          protein_100g: nutrition.per100g.protein_g,
          carbs_100g: nutrition.per100g.carbs_g,
          fat_100g: nutrition.per100g.fat_g,
          portions: [{ label: SERVING_LABEL, grams: nutrition.perServing.grams }],
        }
      : null,
  });
  if (error) return fail(error.code === 'P0002' ? e.notFound : e.generic);
  if (typeof data !== 'string') return fail(e.generic);
  done();
  return { ok: true, id: data };
}

export async function saveRecipe(id: unknown, raw: unknown): Promise<Result<{ id: string }>> {
  let recipeId: string | null = null;
  if (id !== null && id !== undefined) {
    const parsedId = recipeIdSchema.safeParse(id);
    if (!parsedId.success) return fail(e.notFound);
    recipeId = parsedId.data;
  }
  const parsed = recipeInputSchema.safeParse(raw);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const supabase = await createClient();
  if (!(await currentUserId(supabase))) return fail(e.sessionExpired);
  return persist(supabase, recipeId, parsed.data);
}

async function loadRecipe(supabase: Supabase, id: string): Promise<RecipeDetail | null> {
  const { data: row } = await supabase
    .from('recipes')
    .select(RECIPE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (!row) return null;
  const { data: rows } = await supabase
    .from('recipe_items')
    .select(ITEM_COLUMNS)
    .eq('recipe_id', id)
    .order('position', { ascending: true });
  const items = parseItems(rows)
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.item);
  return parseRecipe(row, items);
}

export async function deleteRecipe(id: unknown): Promise<Result> {
  const parsedId = recipeIdSchema.safeParse(id);
  if (!parsedId.success) return fail(e.notFound);
  const supabase = await createClient();
  if (!(await currentUserId(supabase))) return fail(e.sessionExpired);

  const { data, error } = await supabase.rpc('delete_recipe', { p_id: parsedId.data });
  if (error) return fail(e.generic);
  if (data !== true) return fail(e.notFound);
  done();
  return { ok: true };
}

/** Copia una receta con el nombre "Copia de …" (mismos ingredientes y snapshots). */
export async function duplicateRecipe(id: unknown): Promise<Result<{ id: string }>> {
  const parsedId = recipeIdSchema.safeParse(id);
  if (!parsedId.success) return fail(e.notFound);
  const supabase = await createClient();
  if (!(await currentUserId(supabase))) return fail(e.sessionExpired);

  const original = await loadRecipe(supabase, parsedId.data);
  if (!original) return fail(e.notFound);
  const copy = recipeInputSchema.safeParse({
    kind: original.kind,
    name: t(es.recipes.editor.duplicateName, { name: original.name }).slice(0, MAX_NAME),
    servings: original.servings,
    finalWeightG: original.finalWeightG,
    items: original.items,
  });
  if (!copy.success) return fail(firstMessage(copy.error));
  return persist(supabase, null, copy.data);
}

const IMPORT_ERRORS = {
  empty: e.importEmpty,
  too_long: e.importTooLong,
  not_json: e.importNotJson,
  format: e.importFormat,
} as const;

/** Crea una receta a partir del texto que dejó "Copiar para compartir". */
export async function importRecipeText(text: unknown): Promise<Result<{ id: string }>> {
  if (typeof text !== 'string') return fail(e.importFormat);
  const result = importRecipe(text);
  if (!result.ok) {
    return fail(
      result.reason === 'invalid'
        ? (result.message ?? e.importFormat)
        : IMPORT_ERRORS[result.reason],
    );
  }
  const supabase = await createClient();
  if (!(await currentUserId(supabase))) return fail(e.sessionExpired);
  return persist(supabase, null, result.input);
}

/** Agrega al diario todos los alimentos de un combo, cada uno como su propia entrada (origen `recipe`). */
export async function addCombo(
  id: unknown,
  date: unknown,
  meal: unknown,
): Promise<Result<{ count: number }>> {
  const parsedId = recipeIdSchema.safeParse(id);
  const parsedDay = dayInput.safeParse(date);
  const parsedMeal = mealInput.safeParse(meal);
  if (!parsedId.success) return fail(e.notFound);
  if (!parsedDay.success) return fail(firstMessage(parsedDay.error));
  if (!parsedMeal.success) return fail(e.generic);

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const combo = await loadRecipe(supabase, parsedId.data);
  if (!combo || combo.kind !== 'combo') return fail(e.notFound);

  // Un milisegundo de diferencia entre entradas para que conserven el orden del combo.
  const base = Date.now();
  const { error } = await supabase.from('intake_entries').insert(
    combo.items.map((item, index) => {
      const snapshot = snapshotFromPer100g(
        {
          kcal: item.kcal_100g,
          protein_g: item.protein_100g,
          carbs_g: item.carbs_100g,
          fat_g: item.fat_100g,
        },
        item.grams,
      );
      return {
        user_id: userId,
        logged_on: parsedDay.data,
        meal_type: parsedMeal.data,
        food_id: item.foodId,
        name: item.name,
        quantity_g: item.grams,
        ...snapshot,
        origin: 'recipe',
        is_estimate: false,
        created_at: new Date(base + index).toISOString(),
      };
    }),
  );
  if (error) return fail(e.generic);
  revalidatePath('/');
  return { ok: true, count: combo.items.length };
}

/** Guarda una comida del diario como combo. Las calorías rápidas (sin cantidad) no se pueden guardar. */
export async function saveMealAsCombo(raw: unknown): Promise<Result<{ id: string }>> {
  const input = (raw ?? {}) as { day?: unknown; mealType?: unknown; name?: unknown };
  const day = dayInput.safeParse(input.day);
  const meal = mealInput.safeParse(input.mealType);
  const name = recipeInputSchema.shape.name.safeParse(input.name);
  if (!day.success) return fail(firstMessage(day.error));
  if (!meal.success) return fail(e.generic);
  if (!name.success) return fail(firstMessage(name.error));

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data, error } = await supabase
    .from('intake_entries')
    .select('food_id, name, quantity_g, kcal, protein_g, carbs_g, fat_g, created_at')
    .eq('logged_on', day.data)
    .eq('meal_type', meal.data)
    .order('created_at', { ascending: true });
  if (error) return fail(e.generic);

  const per100 = (value: unknown, grams: number) =>
    Math.round((Number(value) / grams) * 100 * 100) / 100;
  const items = (data ?? []).flatMap((row) => {
    const grams = Number(row.quantity_g);
    if (!(grams > 0)) return [];
    return [
      {
        foodId: typeof row.food_id === 'string' ? row.food_id : null,
        name: String(row.name),
        grams,
        kcal_100g: per100(row.kcal, grams),
        protein_100g: per100(row.protein_g, grams),
        carbs_100g: per100(row.carbs_g, grams),
        fat_100g: per100(row.fat_g, grams),
      },
    ];
  });
  if (items.length === 0) return fail(e.nothingToSave);

  const combo = recipeInputSchema.safeParse({
    kind: 'combo',
    name: name.data,
    servings: 1,
    finalWeightG: null,
    items,
  });
  if (!combo.success) return fail(firstMessage(combo.error));
  return persist(supabase, null, combo.data);
}
