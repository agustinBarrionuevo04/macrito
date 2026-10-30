import { FoodSourceError } from './types';

export type FetchLike = typeof fetch;

export type JsonResponse = { status: number; json: unknown };

/** GET con timeout. Lanza `FoodSourceError` si falla la red, vence el tiempo o la respuesta no es JSON. */
export async function getJson(
  fetchImpl: FetchLike,
  source: 'off' | 'usda',
  url: string,
  options: { headers: Record<string, string>; timeoutMs: number },
): Promise<JsonResponse> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', ...options.headers },
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (cause) {
    throw new FoodSourceError(source, `${source}: no se pudo conectar`, { cause });
  }

  if (response.status === 404) return { status: 404, json: null };
  if (!response.ok) throw new FoodSourceError(source, `${source}: HTTP ${response.status}`);

  try {
    return { status: response.status, json: await response.json() };
  } catch (cause) {
    throw new FoodSourceError(source, `${source}: respuesta que no es JSON`, { cause });
  }
}
