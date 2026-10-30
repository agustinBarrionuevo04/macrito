'use server';

import { z } from 'zod';
import { foodRowSchema, rowToCatalogFood } from '@/lib/foods/repository';
import { toFood } from '@/lib/foods/ranking';
import { isPlausible } from '@/lib/foods/nutrition-check';
import { es } from '@/lib/i18n/es';
import { createClient } from '@/lib/supabase/server';
import type { Food } from '@/types';

const e = es.aiFood.errors;

const inputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  per100g: z
    .object({
      kcal: z.number().min(0).max(900),
      protein_g: z.number().min(0).max(100),
      carbs_g: z.number().min(0).max(100),
      fat_g: z.number().min(0).max(100),
    })
    .refine(isPlausible),
});

type Result = { ok: true; food: Food } | { ok: false; error: string };

/**
 * Crea (o reutiliza) un alimento `ai_unverified` del usuario con los valores típicos que supuso el
 * modelo, para poder registrarlo cuando no está en la base. Queda marcado como "sin verificar".
 * Si ya tiene uno con el mismo nombre, se reutiliza para no llenar la lista de duplicados.
 */
export async function createAiFood(raw: unknown): Promise<Result> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: e.createFood };
  const { name, per100g } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: e.unauthorized };

  const { data: existing } = await supabase
    .from('foods')
    .select('*')
    .eq('created_by', user.id)
    .eq('source', 'ai_unverified')
    .eq('name', name)
    .limit(1);
  const found = existing?.[0] ? foodRowSchema.safeParse(existing[0]) : null;
  if (found?.success) return { ok: true, food: toFood(rowToCatalogFood(found.data)) };

  const { data, error } = await supabase
    .from('foods')
    .insert({
      source: 'ai_unverified',
      source_id: null,
      barcode: null,
      name,
      brand: null,
      kcal_100g: per100g.kcal,
      protein_100g: per100g.protein_g,
      carbs_100g: per100g.carbs_g,
      fat_100g: per100g.fat_g,
      portions: [],
      created_by: user.id,
    })
    .select('*')
    .single();
  const row = error || !data ? null : foodRowSchema.safeParse(data);
  return row?.success
    ? { ok: true, food: toFood(rowToCatalogFood(row.data)) }
    : { ok: false, error: e.createFood };
}
