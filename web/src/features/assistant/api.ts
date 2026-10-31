import { z } from 'zod';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import type { PlanMode, PlanResponse } from './types';
import type { MealType } from '@/types';

const messages: Record<string, string> = { ...es.aiFood.errors, ...es.assistant.errors };

/** Error de la API del asistente con el mensaje ya traducido. */
export class PlanApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PlanApiError';
  }
}

const snapshot = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});
const food = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().optional(),
  source: z.string(),
  per100g: z.object({ kcal: z.number() }).passthrough(),
  portions: z.array(z.object({ label: z.string(), grams: z.number() })),
});
const responseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    remaining: snapshot,
    options: z.array(
      z.object({
        title: z.string(),
        meal: z.enum(['breakfast', 'lunch', 'snack', 'dinner']),
        totals: snapshot,
        items: z.array(z.object({ food, grams: z.number(), nutrition: snapshot })),
      }),
    ),
  }),
  z.object({ status: z.literal('reached'), remaining: snapshot }),
]);

async function errorFrom(response: Response): Promise<PlanApiError> {
  let code = 'generic';
  let limit: number | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      if ('error' in body && typeof body.error === 'string') code = body.error;
      if ('limit' in body && typeof body.limit === 'number') limit = body.limit;
    }
  } catch {
    // Sin JSON (por ejemplo, un 502 del proxy): queda el mensaje genérico.
  }
  if (code === 'quota_exceeded') {
    return new PlanApiError(
      code,
      limit === undefined
        ? es.aiFood.errors.quota_exceeded_generic
        : t(es.aiFood.errors.quota_exceeded, { limit }),
    );
  }
  return new PlanApiError(code, messages[code] ?? es.assistant.errors.generic);
}

/** Pide opciones al servidor. Lanza `PlanApiError` con un mensaje listo para mostrar. */
export async function requestPlan(
  input: { mode: PlanMode; meal: MealType; date: string },
  signal?: AbortSignal,
): Promise<PlanResponse> {
  let response: Response;
  try {
    response = await fetch('/api/ai/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new PlanApiError('network', es.aiFood.errors.network);
  }
  if (!response.ok) throw await errorFrom(response);
  const parsed = responseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new PlanApiError('bad_response', es.assistant.errors.generic);
  return parsed.data as PlanResponse;
}
