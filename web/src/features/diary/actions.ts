'use server';

import { revalidatePath } from 'next/cache';
import { es } from '@/lib/i18n/es';
import { createClient } from '@/lib/supabase/server';
import { foodRowSchema, rowToCatalogFood } from '@/lib/foods/repository';
import { entryFromRow, entryRowSchema, ENTRY_COLUMNS, nutritionColumns } from './mapping';
import {
  copySchema,
  dayInput,
  entryDraftSchema,
  entryPatchSchema,
  idInput,
  quickEntrySchema,
  restoreSchema,
} from './schemas';
import { scaleSnapshot, snapshotFromPer100g } from './snapshot';
import type { DiaryEntry, DiaryResult } from './types';

const e = es.diary.errors;

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

const done = () => revalidatePath('/');

/** Entrada propia por id (la RLS ya filtra las ajenas). `null` si no existe. */
async function loadEntry(supabase: Supabase, id: string): Promise<DiaryEntry | null> {
  const { data, error } = await supabase
    .from('intake_entries')
    .select(ENTRY_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const row = entryRowSchema.safeParse(data);
  return row.success ? entryFromRow(row.data) : null;
}

/**
 * Registra un alimento del catálogo en el día `date`. La nutrición se calcula acá, con los valores
 * del alimento guardados en la base: lo que mande el cliente (aparte del id) no se usa.
 */
export async function addEntry(
  draft: unknown,
  date: unknown,
): Promise<DiaryResult<{ id: string }>> {
  const parsedDay = dayInput.safeParse(date);
  if (!parsedDay.success) return fail(firstMessage(parsedDay.error));
  const parsed = entryDraftSchema.safeParse(draft);
  if (!parsed.success) return fail(firstMessage(parsed.error));
  const input = parsed.data;

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data: foodRow } = await supabase
    .from('foods')
    .select('*')
    .eq('id', input.food.id)
    .maybeSingle();
  if (!foodRow) return fail(e.foodNotFound);
  const foodParsed = foodRowSchema.safeParse(foodRow);
  if (!foodParsed.success) return fail(e.generic);
  const food = rowToCatalogFood(foodParsed.data);

  // Si el alimento es el de una receta, la entrada es de origen `recipe` (el cliente no lo sabe: se resuelve acá).
  const { data: recipeRow } = await supabase
    .from('recipes')
    .select('id')
    .eq('food_id', food.id)
    .maybeSingle();
  const origin = recipeRow ? 'recipe' : input.origin;

  const { data, error } = await supabase
    .from('intake_entries')
    .insert({
      user_id: userId,
      logged_on: parsedDay.data,
      meal_type: input.meal_type,
      food_id: food.id,
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      quantity_g: input.quantity_g,
      ...nutritionColumns(snapshotFromPer100g(food.per100g, input.quantity_g)),
      origin,
      is_estimate: input.is_estimate,
    })
    .select('id')
    .single();
  if (error || !data) return fail(e.generic);
  done();
  return { ok: true, id: String((data as { id: unknown }).id) };
}

/** Calorías rápidas: un valor cargado a mano, sin alimento ni cantidad. */
export async function addQuickEntry(
  input: unknown,
  date: unknown,
): Promise<DiaryResult<{ id: string }>> {
  const parsedDay = dayInput.safeParse(date);
  if (!parsedDay.success) return fail(firstMessage(parsedDay.error));
  const parsed = quickEntrySchema.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));
  const quick = parsed.data;

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data, error } = await supabase
    .from('intake_entries')
    .insert({
      user_id: userId,
      logged_on: parsedDay.data,
      meal_type: quick.meal_type,
      food_id: null,
      name: quick.name || es.diary.entry.quick,
      quantity_g: 0,
      kcal: quick.kcal,
      protein_g: quick.protein_g ?? 0,
      carbs_g: quick.carbs_g ?? 0,
      fat_g: quick.fat_g ?? 0,
      origin: 'manual',
      is_estimate: false,
    })
    .select('id')
    .single();
  if (error || !data) return fail(e.generic);
  done();
  return { ok: true, id: String((data as { id: unknown }).id) };
}

/**
 * Cambia la cantidad y/o la comida. Si cambia la cantidad, recalcula la nutrición proporcionalmente
 * a partir de la propia entrada (no del alimento): editar el alimento después no toca el historial.
 */
export async function updateEntry(id: unknown, patch: unknown): Promise<DiaryResult> {
  const parsedId = idInput.safeParse(id);
  if (!parsedId.success) return fail(e.notFound);
  const parsed = entryPatchSchema.safeParse(patch);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const entry = await loadEntry(supabase, parsedId.data);
  if (!entry) return fail(e.notFound);

  const changes: Record<string, unknown> = {};
  if (parsed.data.meal_type) changes.meal_type = parsed.data.meal_type;
  const newQuantity = parsed.data.quantity_g;
  if (newQuantity !== undefined && newQuantity !== entry.quantityG) {
    if (!(entry.quantityG > 0)) return fail(e.quickQuantity);
    changes.quantity_g = newQuantity;
    Object.assign(changes, nutritionColumns(scaleSnapshot(entry, entry.quantityG, newQuantity)));
  }
  if (Object.keys(changes).length === 0) return { ok: true };

  const { data, error } = await supabase
    .from('intake_entries')
    .update(changes)
    .eq('id', entry.id)
    .select('id');
  if (error) return fail(e.generic);
  if (!data || data.length === 0) return fail(e.notFound);
  done();
  return { ok: true };
}

export async function deleteEntry(id: unknown): Promise<DiaryResult> {
  const parsedId = idInput.safeParse(id);
  if (!parsedId.success) return fail(e.notFound);

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data, error } = await supabase
    .from('intake_entries')
    .delete()
    .eq('id', parsedId.data)
    .select('id');
  if (error) return fail(e.generic);
  if (!data || data.length === 0) return fail(e.notFound);
  done();
  return { ok: true };
}

/**
 * Deshacer un borrado: vuelve a insertar la entrada con los mismos datos (id nuevo). Conserva la
 * hora de creación original para que quede en el mismo lugar de la lista.
 */
export async function restoreEntry(raw: unknown): Promise<DiaryResult<{ id: string }>> {
  const parsed = restoreSchema.safeParse(raw);
  if (!parsed.success) return fail(firstMessage(parsed.error));
  const entry = parsed.data;

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { data, error } = await supabase
    .from('intake_entries')
    .insert({
      user_id: userId,
      logged_on: entry.day,
      meal_type: entry.mealType,
      food_id: entry.foodId,
      name: entry.name,
      quantity_g: entry.quantityG,
      ...nutritionColumns(entry),
      origin: entry.origin,
      is_estimate: entry.isEstimate,
      created_at: entry.createdAt,
    })
    .select('id')
    .single();
  if (error || !data) return fail(e.generic);
  done();
  return { ok: true, id: String((data as { id: unknown }).id) };
}

/**
 * Copia una entrada, una comida o un día entero a otra fecha (origen `copy`). Las copias conservan
 * el orden: cada una se crea un milisegundo después de la anterior.
 */
export async function copyEntries(raw: unknown): Promise<DiaryResult<{ count: number }>> {
  const parsed = copySchema.safeParse(raw);
  if (!parsed.success) return fail(firstMessage(parsed.error));
  const { source, toDay, toMeal } = parsed.data;
  if (source.scope !== 'entry' && source.day === toDay) return fail(e.sameDay);

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  let query = supabase.from('intake_entries').select(ENTRY_COLUMNS);
  if (source.scope === 'entry') query = query.eq('id', source.id);
  else {
    query = query.eq('logged_on', source.day);
    if (source.scope === 'meal') query = query.eq('meal_type', source.mealType);
  }
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) return fail(e.generic);
  const originals = (data ?? []).flatMap((row) => {
    const entry = entryRowSchema.safeParse(row);
    return entry.success ? [entryFromRow(entry.data)] : [];
  });
  if (originals.length === 0) return fail(source.scope === 'entry' ? e.notFound : e.nothingToCopy);

  const base = Date.now();
  const { error: insertError } = await supabase.from('intake_entries').insert(
    originals.map((entry, index) => ({
      user_id: userId,
      logged_on: toDay,
      meal_type: source.scope === 'entry' && toMeal ? toMeal : entry.mealType,
      food_id: entry.foodId,
      name: entry.name,
      quantity_g: entry.quantityG,
      ...nutritionColumns(entry),
      origin: 'copy',
      is_estimate: entry.isEstimate,
      created_at: new Date(base + index).toISOString(),
    })),
  );
  if (insertError) return fail(e.generic);
  done();
  return { ok: true, count: originals.length };
}
