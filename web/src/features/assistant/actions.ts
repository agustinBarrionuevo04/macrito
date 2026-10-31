'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { nutritionColumns } from '@/features/diary/mapping';
import { dayInput, idInput, mealInput } from '@/features/diary/schemas';
import { snapshotFromPer100g } from '@/features/diary/snapshot';
import { foodRowSchema, rowToCatalogFood } from '@/lib/foods/repository';
import { es } from '@/lib/i18n/es';
import { createClient } from '@/lib/supabase/server';
import { MAX_ITEMS_PER_OPTION } from './schema';

const e = es.assistant.errors;

type Result = { ok: true; count: number } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const MAX_GRAMS = 3000;

const inputSchema = z.object({
  meal: mealInput,
  items: z
    .array(
      z.object({
        foodId: idInput,
        grams: z.number().gt(0).max(MAX_GRAMS),
      }),
    )
    .min(1)
    .max(MAX_ITEMS_PER_OPTION),
});

/**
 * Agrega al diario todos los alimentos de una opción sugerida, cada uno como su entrada. Del cliente
 * solo se toman ids y gramos: la nutrición se calcula con los valores del alimento en la base.
 */
export async function addSuggestion(date: unknown, raw: unknown): Promise<Result> {
  const day = dayInput.safeParse(date);
  if (!day.success) return fail(day.error.issues[0]?.message ?? e.generic);
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return fail(e.generic);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(e.sessionExpired);

  const ids = [...new Set(parsed.data.items.map((item) => item.foodId))];
  const { data: rows, error } = await supabase.from('foods').select('*').in('id', ids);
  if (error) return fail(e.generic);
  const foods = new Map(
    (rows ?? []).flatMap((row) => {
      const food = foodRowSchema.safeParse(row);
      return food.success ? [[food.data.id, rowToCatalogFood(food.data)] as const] : [];
    }),
  );
  // Un alimento que ya no existe (o que no es visible para esta persona) cancela todo: no se agrega media comida.
  if (parsed.data.items.some((item) => !foods.has(item.foodId))) return fail(e.foodNotFound);

  // Un milisegundo de diferencia entre entradas para que conserven el orden de la opción.
  const base = Date.now();
  const { error: insertError } = await supabase.from('intake_entries').insert(
    parsed.data.items.map((item, index) => {
      const food = foods.get(item.foodId)!;
      return {
        user_id: user.id,
        logged_on: day.data,
        meal_type: parsed.data.meal,
        food_id: food.id,
        name: food.brand ? `${food.name} (${food.brand})` : food.name,
        quantity_g: item.grams,
        ...nutritionColumns(snapshotFromPer100g(food.per100g, item.grams)),
        origin: 'ai_text',
        is_estimate: false,
        created_at: new Date(base + index).toISOString(),
      };
    }),
  );
  if (insertError) return fail(e.generic);
  revalidatePath('/');
  return { ok: true, count: parsed.data.items.length };
}
