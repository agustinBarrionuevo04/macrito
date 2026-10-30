import type { Confidence, Food, PhotoItem } from '@/types';

/** Un renglón de la pantalla de revisión. */
export type ReviewItem = {
  key: string;
  /** Lo que dijo el modelo (se muestra si no hay alimento). */
  query: string;
  /** Alimento de la base (encontrado o elegido a mano). */
  food: Food | null;
  /** Valores típicos que supone el modelo; solo se usan si `food` es `null`. */
  guess: NonNullable<PhotoItem['per100g_guess']> | null;
  /** `null` = todavía falta que la persona la complete. */
  grams: number | null;
  confidence: Confidence;
};

const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'con',
  'y',
  'a',
  'al',
  'en',
  'un',
  'una',
]);

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();

/** Raíz muy simple para que "milanesas" coincida con "milanesa". */
const stem = (token: string) =>
  token.length > 3 && token.endsWith('es')
    ? token.slice(0, -2)
    : token.length > 3 && token.endsWith('s')
      ? token.slice(0, -1)
      : token;

const tokens = (text: string) =>
  normalize(text)
    .split(' ')
    .filter((token) => token && !STOPWORDS.has(token))
    .map(stem);

/** Fracción mínima de las palabras de la consulta que tiene que aparecer en el nombre. */
export const MATCH_THRESHOLD = 0.6;

/**
 * Primer alimento (en el orden que ya trae la búsqueda: favoritos y recientes, `ar_seed` y propios,
 * resto) cuyo nombre contiene casi todas las palabras de la consulta. `null` si ninguno lo hace:
 * mejor "no encontrado" que un alimento equivocado.
 */
export function pickMatch(query: string, foods: readonly Food[]): Food | null {
  const wanted = tokens(query);
  if (wanted.length === 0) return null;
  for (const food of foods) {
    const have = new Set(tokens(`${food.name} ${food.brand ?? ''}`));
    const hits = wanted.filter((token) => have.has(token)).length;
    if (hits / wanted.length >= MATCH_THRESHOLD) return food;
  }
  return null;
}

/**
 * Gramos iniciales del renglón: lo que estimó el modelo; si no estimó y el alimento tiene porciones,
 * la cantidad de unidades por el peso de su primera porción; si no, `null` (la persona la completa).
 */
export function initialGrams(item: PhotoItem, food: Food | null): number | null {
  if (item.est_grams !== null) return item.est_grams;
  const portion = food?.portions[0];
  if (portion && portion.grams > 0)
    return Math.round(portion.grams * (item.count ?? 1) * 100) / 100;
  return null;
}

export type SearchFn = (query: string, signal?: AbortSignal) => Promise<{ foods: Food[] }>;

/**
 * Busca cada ítem en la base (de a `concurrency` para no pasarse del límite de búsquedas por minuto).
 * Si la búsqueda de un ítem falla, queda sin alimento: la persona lo elige a mano.
 */
export async function resolveItems(
  items: readonly PhotoItem[],
  search: SearchFn,
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<ReviewItem[]> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const result: ReviewItem[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      const item = items[index]!;
      let food: Food | null = null;
      try {
        food =
          item.query.trim().length >= 2
            ? pickMatch(item.query, (await search(item.query, options.signal)).foods)
            : null;
      } catch (error) {
        if (options.signal?.aborted) throw error;
      }
      result[index] = {
        key: `${index}-${item.query}`,
        query: item.query,
        food,
        guess: food ? null : (item.per100g_guess ?? null),
        grams: initialGrams(item, food),
        confidence: item.confidence,
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return result;
}
