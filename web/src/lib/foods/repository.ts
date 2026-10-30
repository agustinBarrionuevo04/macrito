import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { FoodStore } from './service';
import type { CatalogFood } from './types';

const SEARCH_CANDIDATES = 40;

// PostgREST devuelve `numeric` como número, pero se acepta string por si cambia la serialización.
const numeric = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());
const nullableNumeric = numeric.nullish().transform((v) => v ?? undefined);

const portionsSchema = z.array(z.object({ label: z.string(), grams: numeric })).catch([]);

export const foodRowSchema = z.object({
  id: z.string(),
  source: z.enum(['off', 'usda', 'ar_seed', 'custom', 'ai_unverified']),
  source_id: z.string().nullable(),
  barcode: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  kcal_100g: numeric,
  protein_100g: numeric,
  carbs_100g: numeric,
  fat_100g: numeric,
  fiber_100g: nullableNumeric,
  sugar_100g: nullableNumeric,
  sodium_mg_100g: nullableNumeric,
  portions: portionsSchema,
  created_by: z.string().nullable(),
});

const searchRowSchema = foodRowSchema.extend({
  is_favorite: z.boolean(),
  last_used_on: z.string().nullable(),
  score: numeric,
});

type FoodRow = z.infer<typeof foodRowSchema>;

export function rowToCatalogFood(row: FoodRow): CatalogFood {
  const per100g: CatalogFood['per100g'] = {
    kcal: row.kcal_100g,
    protein_g: row.protein_100g,
    carbs_g: row.carbs_100g,
    fat_g: row.fat_100g,
  };
  if (row.fiber_100g !== undefined) per100g.fiber_g = row.fiber_100g;
  if (row.sugar_100g !== undefined) per100g.sugar_g = row.sugar_100g;
  if (row.sodium_mg_100g !== undefined) per100g.sodium_mg = row.sodium_mg_100g;

  const food: CatalogFood = {
    id: row.id,
    source: row.source,
    name: row.name,
    per100g,
    portions: row.portions,
    createdBy: row.created_by,
  };
  if (row.source_id) food.sourceId = row.source_id;
  if (row.barcode) food.barcode = row.barcode;
  if (row.brand) food.brand = row.brand;
  return food;
}

export function catalogFoodToRow(food: CatalogFood) {
  return {
    source: food.source,
    source_id: food.sourceId ?? null,
    barcode: food.barcode ?? null,
    name: food.name,
    brand: food.brand ?? null,
    kcal_100g: food.per100g.kcal,
    protein_100g: food.per100g.protein_g,
    carbs_100g: food.per100g.carbs_g,
    fat_100g: food.per100g.fat_g,
    fiber_100g: food.per100g.fiber_g ?? null,
    sugar_100g: food.per100g.sugar_g ?? null,
    sodium_mg_100g: food.per100g.sodium_mg ?? null,
    portions: food.portions,
    created_by: null,
  };
}

/**
 * Catálogo sobre Supabase. Lee con el cliente del usuario (RLS decide qué ve) y escribe el
 * catálogo compartido con el cliente de servicio, porque los usuarios no pueden escribir ahí.
 */
export function createSupabaseFoodStore(clients: {
  user: SupabaseClient;
  admin: SupabaseClient;
}): FoodStore {
  return {
    async search(query) {
      const { data, error } = await clients.user.rpc('search_foods', {
        q: query,
        max_results: SEARCH_CANDIDATES,
      });
      if (error) throw new Error(`search_foods falló: ${error.message}`);

      return z
        .array(searchRowSchema)
        .parse(data ?? [])
        .map((row) => ({
          ...rowToCatalogFood(row),
          isFavorite: row.is_favorite,
          lastUsedOn: row.last_used_on,
          score: row.score,
        }));
    },

    async findByBarcode(barcode) {
      const { data, error } = await clients.user
        .from('foods')
        .select('*')
        .eq('barcode', barcode)
        .limit(5);
      if (error) throw new Error(`consulta por código de barras falló: ${error.message}`);

      const foods = z
        .array(foodRowSchema)
        .parse(data ?? [])
        .map(rowToCatalogFood);
      // Si el usuario corrigió el producto, gana su versión sobre la del catálogo compartido.
      return foods.find((food) => food.createdBy) ?? foods[0] ?? null;
    },

    async saveShared(foods) {
      const unique = new Map<string, CatalogFood>();
      for (const food of foods) {
        if (food.source !== 'off' && food.source !== 'usda') {
          throw new Error(`No se guarda en el catálogo compartido: ${food.source}`);
        }
        unique.set(`${food.source}:${food.sourceId ?? ''}`, food);
      }

      const { data, error } = await clients.admin
        .from('foods')
        .upsert([...unique.values()].map(catalogFoodToRow), { onConflict: 'source,source_id' })
        .select('*');
      if (error) throw new Error(`no se pudo guardar el catálogo: ${error.message}`);

      return z
        .array(foodRowSchema)
        .parse(data ?? [])
        .map(rowToCatalogFood);
    },
  };
}
