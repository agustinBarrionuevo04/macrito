import type { Food } from '@/types';
import { dedupeFoods, foodKey, rankFoods, toFood } from './ranking';
import { FoodSourceError, type CatalogFood } from './types';

/** Catálogo local (tabla `foods`). */
export type FoodStore = {
  search(query: string): Promise<CatalogFood[]>;
  findByBarcode(barcode: string): Promise<CatalogFood | null>;
  /** Guarda en el catálogo compartido y devuelve las filas con su id. */
  saveShared(foods: CatalogFood[]): Promise<CatalogFood[]>;
};

export type FoodServiceDeps = {
  store: FoodStore;
  off: {
    search(query: string): Promise<CatalogFood[]>;
    getByBarcode(barcode: string): Promise<CatalogFood | null>;
  };
  /** `null` si no hay API key de USDA: se omite sin error. */
  usda: { search(query: string): Promise<CatalogFood[]> } | null;
};

export type SearchOutcome = {
  foods: Food[];
  /** Alguna fuente externa falló y la lista puede estar incompleta. */
  degraded: boolean;
};

/** Con al menos esta cantidad de coincidencias locales no se consulta a OFF ni a USDA. */
export const LOCAL_ENOUGH = 8;
export const RESULT_LIMIT = 20;

export function createFoodService({ store, off, usda }: FoodServiceDeps) {
  return {
    async search(query: string): Promise<SearchOutcome> {
      const local = await store.search(query);

      const remote: CatalogFood[] = [];
      let degraded = false;
      let attempts = 0;
      let failures = 0;

      if (local.length < LOCAL_ENOUGH) {
        const sources = [off.search(query), ...(usda ? [usda.search(query)] : [])];
        attempts = sources.length;
        const results = await Promise.allSettled(sources);
        for (const result of results) {
          if (result.status === 'fulfilled') remote.push(...result.value);
          else failures += 1;
        }
        degraded = failures > 0;
      }

      if (attempts > 0 && failures === attempts && local.length === 0) {
        throw new FoodSourceError('off', 'Ninguna fuente de alimentos respondió');
      }

      const ranked = rankFoods(dedupeFoods(local, remote), query, RESULT_LIMIT);

      // Solo se guardan los resultados externos que llegaron a mostrarse.
      const pending = ranked.filter((food) => food.id === '');
      const saved = new Map<string, CatalogFood>();
      if (pending.length > 0) {
        for (const food of await store.saveShared(pending)) saved.set(foodKey(food), food);
      }

      const foods = ranked.flatMap((food) => {
        if (food.id !== '') return [toFood(food)];
        const stored = saved.get(foodKey(food));
        return stored ? [toFood(stored)] : [];
      });
      return { foods, degraded };
    },

    /** Devuelve `null` si el producto no existe o no tiene datos nutricionales completos. */
    async barcode(barcode: string): Promise<Food | null> {
      const local = await store.findByBarcode(barcode);
      if (local) return toFood(local);

      const found = await off.getByBarcode(barcode);
      if (!found) return null;
      const [stored] = await store.saveShared([found]);
      return stored ? toFood(stored) : null;
    },
  };
}
