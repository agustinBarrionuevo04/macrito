import { z } from 'zod';
import { es } from '@/lib/i18n/es';
import type { Food } from '@/types';

const nutrientsSchema = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number().optional(),
  sugar_g: z.number().optional(),
  sodium_mg: z.number().optional(),
});

const foodSchema = z.object({
  id: z.string(),
  source: z.enum(['off', 'usda', 'ar_seed', 'custom', 'ai_unverified']),
  name: z.string(),
  brand: z.string().optional(),
  barcode: z.string().optional(),
  per100g: nutrientsSchema,
  portions: z.array(z.object({ label: z.string(), grams: z.number() })),
});

/** Error de la API de alimentos, ya con el mensaje traducido para mostrar. */
export class FoodsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FoodsApiError';
  }
}

type Messages = Record<string, string> & { generic: string };

async function errorFrom(response: Response, messages: Messages): Promise<FoodsApiError> {
  let code = 'generic';
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      code = body.error;
    }
  } catch {
    // Sin cuerpo JSON (por ejemplo, un 502 del proxy): queda el mensaje genérico.
  }
  return new FoodsApiError(code, messages[code] ?? messages.generic);
}

async function getJson(url: string, messages: Messages, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new FoodsApiError('network', messages.sources_unavailable ?? messages.generic);
  }
  if (!response.ok) throw await errorFrom(response, messages);
  return response;
}

export async function searchFoods(
  query: string,
  signal?: AbortSignal,
): Promise<{ foods: Food[]; degraded: boolean }> {
  const messages = es.addFood.search.errors;
  const response = await getJson(
    `/api/foods/search?q=${encodeURIComponent(query)}`,
    messages,
    signal,
  );
  const parsed = z.array(foodSchema).safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new FoodsApiError('generic', messages.generic);
  return { foods: parsed.data, degraded: response.headers.get('X-Foods-Degraded') === '1' };
}

/** Producto por código de barras ya normalizado. `null` si no existe. */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<Food | null> {
  const messages = es.addFood.scan.errors;
  const response = await getJson(
    `/api/foods/barcode/${encodeURIComponent(code)}`,
    messages,
    signal,
  );
  const body: unknown = await response.json().catch(() => undefined);
  if (body === null) return null;
  const parsed = foodSchema.safeParse(body);
  if (!parsed.success) throw new FoodsApiError('generic', messages.generic);
  return parsed.data;
}
