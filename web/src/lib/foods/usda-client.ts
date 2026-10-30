import { getJson, type FetchLike } from './http';
import { normalizeUsdaFood } from './normalize-usda';
import type { CatalogFood } from './types';

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const PAGE_SIZE = 15;

export type UsdaClient = { search(query: string): Promise<CatalogFood[]> };

export type UsdaClientOptions = {
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

export function createUsdaClient({
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 6000,
}: UsdaClientOptions): UsdaClient {
  return {
    async search(query) {
      const params = new URLSearchParams({
        query,
        dataType: 'Foundation,SR Legacy',
        pageSize: String(PAGE_SIZE),
      });
      // La key va en el header, no en la URL, para que no quede en logs.
      const { json } = await getJson(fetchImpl, 'usda', `${SEARCH_URL}?${params}`, {
        headers: { 'X-Api-Key': apiKey },
        timeoutMs,
      });
      const foods =
        typeof json === 'object' && json !== null ? (json as { foods?: unknown }).foods : [];
      return Array.isArray(foods) ? foods.flatMap((item) => normalizeUsdaFood(item) ?? []) : [];
    },
  };
}
