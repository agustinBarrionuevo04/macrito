import type { Food } from '@/types';
import type { CatalogFood } from './types';

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Relevancia textual 0–1 para resultados que no pasaron por la búsqueda local: prefijo 0.9,
 * contiene la consulta completa 0.6, y si no, la fracción de palabras de la consulta que aparecen.
 */
export function textScore(name: string, query: string): number {
  const n = normalizeText(name);
  const q = normalizeText(query);
  if (q === '') return 0;
  if (n.startsWith(q)) return 0.9;
  if (n.includes(q)) return 0.6;
  const tokens = q.split(/\s+/).filter(Boolean);
  const found = tokens.filter((token) => n.includes(token)).length;
  return (found / tokens.length) * 0.5;
}

/** 0 = favoritos y recientes del usuario, 1 = ar_seed y alimentos propios, 2 = el resto. */
function tier(food: CatalogFood): 0 | 1 | 2 {
  if (food.isFavorite || food.lastUsedOn) return 0;
  if (food.source === 'ar_seed' || food.createdBy) return 1;
  return 2;
}

export function foodKey(food: CatalogFood): string {
  return food.sourceId ? `${food.source}:${food.sourceId}` : `id:${food.id}`;
}

/** Junta listas sin duplicados (gana la primera aparición: la local trae favoritos y recientes). */
export function dedupeFoods(...lists: CatalogFood[][]): CatalogFood[] {
  const seen = new Set<string>();
  const result: CatalogFood[] = [];
  for (const list of lists) {
    for (const food of list) {
      const key = foodKey(food);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(food);
    }
  }
  return result;
}

/**
 * Orden de resultados: favoritos y recientes → ar_seed (y alimentos propios) → resto.
 * Dentro de cada grupo, primero la relevancia textual; luego favoritos antes que recientes y
 * lo usado más recientemente primero; en el resto, vendidos en Argentina y más populares primero.
 */
export function rankFoods(foods: CatalogFood[], query: string, limit: number): CatalogFood[] {
  const scored = foods.map((food) => ({
    food,
    tier: tier(food),
    score: food.score ?? textScore(food.name, query),
  }));

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (b.score !== a.score) return b.score - a.score;
    if (a.tier === 0) {
      if (Boolean(a.food.isFavorite) !== Boolean(b.food.isFavorite))
        return a.food.isFavorite ? -1 : 1;
      const byUse = (b.food.lastUsedOn ?? '').localeCompare(a.food.lastUsedOn ?? '');
      if (byUse !== 0) return byUse;
    }
    if (Boolean(a.food.argentina) !== Boolean(b.food.argentina)) return a.food.argentina ? -1 : 1;
    const byPopularity = (b.food.popularity ?? 0) - (a.food.popularity ?? 0);
    if (byPopularity !== 0) return byPopularity;
    return a.food.name.localeCompare(b.food.name, 'es');
  });

  return scored.slice(0, limit).map((s) => s.food);
}

/** Lo que sale por la API: el contrato `Food`, sin los datos internos de ordenamiento. */
export function toFood(food: CatalogFood): Food {
  const result: Food = {
    id: food.id,
    source: food.source,
    name: food.name,
    per100g: food.per100g,
    portions: food.portions,
  };
  if (food.brand) result.brand = food.brand;
  if (food.barcode) result.barcode = food.barcode;
  return result;
}
