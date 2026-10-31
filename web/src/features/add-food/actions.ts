'use server';

import { es } from '@/lib/i18n/es';
import { foodRowSchema, rowToCatalogFood } from '@/lib/foods/repository';
import { toFood } from '@/lib/foods/ranking';
import { createClient } from '@/lib/supabase/server';
import type { Food } from '@/types';
import { customFoodSchema, foodIdSchema, type CustomFoodInput } from './schemas';

const e = es.addFood.custom.errors;

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentUserId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function firstMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? e.generic;
}

/** Columnas de `foods` a partir del formulario. Siempre `custom` y del usuario. */
function columnsFromInput(input: CustomFoodInput) {
  return {
    barcode: input.barcode ?? null,
    name: input.name,
    brand: input.brand ?? null,
    kcal_100g: input.kcal,
    protein_100g: input.protein_g,
    carbs_100g: input.carbs_g,
    fat_100g: input.fat_g,
    fiber_100g: input.fiber_g ?? null,
    sugar_100g: input.sugar_g ?? null,
    sodium_mg_100g: input.sodium_mg ?? null,
    portions: input.portions,
  };
}

function foodFromRow(row: unknown): Food | null {
  const parsed = foodRowSchema.safeParse(row);
  return parsed.success ? toFood(rowToCatalogFood(parsed.data)) : null;
}

/** Crea un alimento propio (también sirve para "corregir" uno del catálogo: se guarda una copia). */
export async function createCustomFood(raw: unknown): Promise<Result<{ food: Food }>> {
  const parsed = customFoodSchema.safeParse(raw);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data, error } = await supabase
    .from('foods')
    .insert({
      ...columnsFromInput(parsed.data),
      source: 'custom',
      source_id: null,
      created_by: userId,
    })
    .select('*')
    .single();
  const food = error || !data ? null : foodFromRow(data);
  return food ? { ok: true, food } : fail(e.generic);
}

/**
 * Edita un alimento propio. Las entradas ya registradas no cambian (guardan su propio snapshot).
 * No toca `source` ni `created_by`: un alimento no se puede "robar" ni cambiar de tipo.
 */
export async function updateCustomFood(id: unknown, raw: unknown): Promise<Result<{ food: Food }>> {
  const parsedId = foodIdSchema.safeParse(id);
  if (!parsedId.success) return fail(e.notFound);
  const parsed = customFoodSchema.safeParse(raw);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data: current } = await supabase
    .from('foods')
    .select('id, created_by')
    .eq('id', parsedId.data)
    .maybeSingle();
  if (!current) return fail(e.notFound);
  if ((current as { created_by: unknown }).created_by !== userId) return fail(e.notOwn);

  // El alimento de una receta se calcula desde sus ingredientes: editarlo a mano lo desincronizaría.
  const { data: recipe } = await supabase
    .from('recipes')
    .select('id')
    .eq('food_id', parsedId.data)
    .maybeSingle();
  if (recipe) return fail(es.recipes.errors.isRecipeFood);

  const { data, error } = await supabase
    .from('foods')
    .update(columnsFromInput(parsed.data))
    .eq('id', parsedId.data)
    .eq('created_by', userId)
    .select('*');
  if (error) return fail(e.generic);
  const food = data?.[0] ? foodFromRow(data[0]) : null;
  return food ? { ok: true, food } : fail(e.notFound);
}

/** Marca o desmarca un alimento como favorito del usuario. Es idempotente. */
export async function setFavorite(foodId: unknown, favorite: unknown): Promise<Result> {
  const parsedId = foodIdSchema.safeParse(foodId);
  if (!parsedId.success || typeof favorite !== 'boolean') return fail(e.generic);

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { error } = favorite
    ? await supabase
        .from('favorite_foods')
        .upsert(
          { user_id: userId, food_id: parsedId.data },
          { onConflict: 'user_id,food_id', ignoreDuplicates: true },
        )
    : await supabase
        .from('favorite_foods')
        .delete()
        .eq('user_id', userId)
        .eq('food_id', parsedId.data);
  return error ? fail(e.generic) : { ok: true };
}
