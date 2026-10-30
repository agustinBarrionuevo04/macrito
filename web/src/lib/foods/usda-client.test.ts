import { describe, expect, it } from 'vitest';
import { createUsdaClient } from './usda-client';
import { fakeFetch, jsonResponse } from './test-helpers';

const item = (fdcId: number, description: string, dataType = 'SR Legacy') => ({
  fdcId,
  description,
  dataType,
  foodNutrients: [
    { nutrientNumber: '208', value: 215 },
    { nutrientNumber: '203', value: 18.6 },
    { nutrientNumber: '204', value: 15 },
    { nutrientNumber: '205', value: 0 },
  ],
});

describe('UsdaClient.search', () => {
  it('busca solo alimentos genéricos y manda la key en el header, no en la URL', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      jsonResponse({
        foods: [item(1, 'Beef, raw'), item(2, 'Branded thing', 'Branded'), { fdcId: 3 }],
      }),
    );
    const foods = await createUsdaClient({ apiKey: 'SECRETA', fetchImpl }).search('beef');

    expect(foods.map((f) => f.name)).toEqual(['Beef, raw']);
    const { url, init } = calls[0]!;
    expect(url.host).toBe('api.nal.usda.gov');
    expect(url.pathname).toBe('/fdc/v1/foods/search');
    expect(url.searchParams.get('query')).toBe('beef');
    expect(url.searchParams.get('dataType')).toBe('Foundation,SR Legacy');
    expect(url.toString()).not.toContain('SECRETA');
    expect(new Headers(init?.headers).get('X-Api-Key')).toBe('SECRETA');
  });

  it('una respuesta sin `foods` es una lista vacía', async () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse({ totalHits: 0 }));
    expect(await createUsdaClient({ apiKey: 'k', fetchImpl }).search('zzz')).toEqual([]);
    const arrayless = fakeFetch(() => jsonResponse({ foods: 'x' }));
    expect(
      await createUsdaClient({ apiKey: 'k', fetchImpl: arrayless.fetchImpl }).search('zzz'),
    ).toEqual([]);
  });

  it('lanza FoodSourceError ante 403 (key inválida) o 429 (límite)', async () => {
    for (const status of [403, 429, 500]) {
      const { fetchImpl } = fakeFetch(() => new Response('no', { status }));
      await expect(createUsdaClient({ apiKey: 'k', fetchImpl }).search('x')).rejects.toMatchObject({
        name: 'FoodSourceError',
        source: 'usda',
      });
    }
  });

  it('lanza FoodSourceError si falla la red', async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(createUsdaClient({ apiKey: 'k', fetchImpl }).search('x')).rejects.toMatchObject({
      source: 'usda',
    });
  });
});
