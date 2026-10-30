import { z } from 'zod';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import type { PhotoItem } from '@/types';

const messages = es.aiFood.errors;

/** Error de la API de IA con el mensaje ya traducido. */
export class AiApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AiApiError';
  }
}

const itemSchema = z.object({
  query: z.string(),
  est_grams: z.number().nullable(),
  count: z.number().optional(),
  confidence: z.enum(['low', 'med', 'high']),
  per100g_guess: z
    .object({ kcal: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() })
    .optional(),
});
const responseSchema = z.object({ items: z.array(itemSchema) });

async function errorFrom(response: Response): Promise<AiApiError> {
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
  const known = messages as Record<string, string>;
  if (code === 'quota_exceeded') {
    return new AiApiError(
      code,
      limit === undefined ? messages.quota_exceeded_generic : t(messages.quota_exceeded, { limit }),
    );
  }
  return new AiApiError(code, known[code] ?? messages.generic);
}

async function send(url: string, init: RequestInit): Promise<PhotoItem[]> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AiApiError('network', messages.network);
  }
  if (!response.ok) throw await errorFrom(response);
  const parsed = responseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new AiApiError('generic', messages.generic);
  return parsed.data.items;
}

export function analyzePhoto(image: Blob, signal?: AbortSignal): Promise<PhotoItem[]> {
  const form = new FormData();
  form.set('image', image, 'comida.jpg');
  return send('/api/ai/photo', { method: 'POST', body: form, signal });
}

export function analyzeText(text: string, signal?: AbortSignal): Promise<PhotoItem[]> {
  return send('/api/ai/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
}
