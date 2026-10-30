import { getJson, type FetchLike } from './http';
import { normalizeOffProduct } from './normalize-off';
import { FoodSourceError, type CatalogFood } from './types';

const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const LEGACY_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';

const PAGE_SIZE = 40;

const FIELDS = [
  'code',
  'brands',
  'product_name',
  'product_name_es',
  'product_name_en',
  'product_name_fr',
  'quantity',
  'serving_quantity',
  'serving_size',
  'nutriments',
  'popularity_key',
  'countries_tags',
].join(',');

export type OffClient = {
  search(query: string): Promise<CatalogFood[]>;
  getByBarcode(barcode: string): Promise<CatalogFood | null>;
};

export type OffClientOptions = {
  userAgent: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

function normalizeAll(items: unknown): CatalogFood[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => normalizeOffProduct(item) ?? []);
}

function field(json: unknown, key: string): unknown {
  return typeof json === 'object' && json !== null
    ? (json as Record<string, unknown>)[key]
    : undefined;
}

export function createOffClient({
  userAgent,
  fetchImpl = fetch,
  timeoutMs = 6000,
}: OffClientOptions): OffClient {
  const request = (url: string) =>
    getJson(fetchImpl, 'off', url, { headers: { 'User-Agent': userAgent }, timeoutMs });

  return {
    async search(query) {
      // Search-a-licious tiene caídas propias: si falla, se prueba el buscador clásico.
      const modern = new URLSearchParams({
        q: query,
        fields: FIELDS,
        langs: 'es',
        page_size: String(PAGE_SIZE),
        page: '1',
      });
      try {
        const { json } = await request(`${SEARCH_URL}?${modern}`);
        return normalizeAll(field(json, 'hits'));
      } catch (modernError) {
        const legacy = new URLSearchParams({
          search_terms: query,
          search_simple: '1',
          action: 'process',
          json: 'true',
          fields: FIELDS,
          page_size: String(PAGE_SIZE),
          page: '1',
        });
        try {
          const { json } = await request(`${LEGACY_SEARCH_URL}?${legacy}`);
          return normalizeAll(field(json, 'products'));
        } catch (legacyError) {
          throw new FoodSourceError('off', 'off: la búsqueda no respondió', {
            cause: new AggregateError([modernError, legacyError]),
          });
        }
      }
    },

    async getByBarcode(barcode) {
      const params = new URLSearchParams({ fields: FIELDS, json: 'true' });
      const { status, json } = await request(
        `${PRODUCT_URL}/${encodeURIComponent(barcode)}?${params}`,
      );
      if (status === 404 || field(json, 'status') === 0) return null;
      return normalizeOffProduct(field(json, 'product'));
    },
  };
}
