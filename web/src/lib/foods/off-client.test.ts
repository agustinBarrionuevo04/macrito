import { describe, expect, it } from 'vitest';
import { createOffClient } from './off-client';
import { fakeFetch, jsonResponse } from './test-helpers';
import { FoodSourceError } from './types';

const product = (code: string, name: string) => ({
  code,
  product_name: name,
  nutriments: {
    'energy-kcal_100g': 250,
    proteins_100g: 20,
    carbohydrates_100g: 15,
    fat_100g: 12,
  },
});

const options = { userAgent: 'Macritos/test (contacto)' };

describe('OffClient.search', () => {
  it('consulta Search-a-licious con el User-Agent propio y normaliza los resultados', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      jsonResponse({ hits: [product('7790070410108', 'Milanesa'), { code: 'x' }] }),
    );
    const foods = await createOffClient({ ...options, fetchImpl }).search('milanesa de pollo');

    expect(foods.map((f) => f.name)).toEqual(['Milanesa']);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url.host).toBe('search.openfoodfacts.org');
    expect(url.searchParams.get('q')).toBe('milanesa de pollo');
    expect(url.searchParams.get('langs')).toBe('es');
    expect(url.searchParams.get('fields')).toContain('nutriments');
    expect(new Headers(init?.headers).get('User-Agent')).toBe('Macritos/test (contacto)');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('si Search-a-licious responde 5xx usa el buscador clásico', async () => {
    const { fetchImpl, calls } = fakeFetch((url) =>
      url.host === 'search.openfoodfacts.org'
        ? new Response('bad gateway', { status: 502 })
        : jsonResponse({ products: [product('7790070410108', 'Milanesa clásica')] }),
    );
    const foods = await createOffClient({ ...options, fetchImpl }).search('milanesa');

    expect(foods.map((f) => f.name)).toEqual(['Milanesa clásica']);
    expect(calls.map((c) => c.url.host)).toEqual([
      'search.openfoodfacts.org',
      'world.openfoodfacts.org',
    ]);
    expect(calls[1]!.url.pathname).toBe('/cgi/search.pl');
    expect(calls[1]!.url.searchParams.get('search_terms')).toBe('milanesa');
  });

  it('también cae al clásico ante un error de red o una respuesta que no es JSON', async () => {
    const network = fakeFetch((url) => {
      if (url.host === 'search.openfoodfacts.org') throw new TypeError('fetch failed');
      return jsonResponse({ products: [product('7790070410108', 'Ok')] });
    });
    expect(
      await createOffClient({ ...options, fetchImpl: network.fetchImpl }).search('x'),
    ).toHaveLength(1);

    const html = fakeFetch((url) =>
      url.host === 'search.openfoodfacts.org'
        ? new Response('<html>', { status: 200 })
        : jsonResponse({ products: [product('7790070410108', 'Ok')] }),
    );
    expect(
      await createOffClient({ ...options, fetchImpl: html.fetchImpl }).search('x'),
    ).toHaveLength(1);
  });

  it('lanza FoodSourceError si ninguna de las dos búsquedas responde', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('down', { status: 503 }));
    await expect(createOffClient({ ...options, fetchImpl }).search('x')).rejects.toMatchObject({
      name: 'FoodSourceError',
      source: 'off',
    });
  });

  it('una respuesta sin `hits` es una lista vacía, no un error', async () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse({ count: 0 }));
    expect(await createOffClient({ ...options, fetchImpl }).search('zzz')).toEqual([]);
  });
});

describe('OffClient.getByBarcode', () => {
  it('devuelve el producto normalizado y codifica el código en la URL', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      jsonResponse({ status: 1, product: product('7790070410108', 'Galletitas') }),
    );
    const food = await createOffClient({ ...options, fetchImpl }).getByBarcode('7790070410108');

    expect(food).toMatchObject({ source: 'off', barcode: '7790070410108', name: 'Galletitas' });
    expect(calls[0]!.url.pathname).toBe('/api/v2/product/7790070410108');
    expect(calls[0]!.url.searchParams.get('fields')).toContain('serving_quantity');
  });

  it('devuelve null si el producto no existe (404 o status 0)', async () => {
    const notFound = fakeFetch(() =>
      jsonResponse({ status: 0, status_verbose: 'product not found' }, 404),
    );
    expect(
      await createOffClient({ ...options, fetchImpl: notFound.fetchImpl }).getByBarcode('1'),
    ).toBeNull();

    const status0 = fakeFetch(() => jsonResponse({ status: 0 }));
    expect(
      await createOffClient({ ...options, fetchImpl: status0.fetchImpl }).getByBarcode('1'),
    ).toBeNull();
  });

  it('devuelve null si el producto no tiene datos nutricionales completos', async () => {
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse({ status: 1, product: { code: '7790070410108', product_name: 'Sin datos' } }),
    );
    expect(
      await createOffClient({ ...options, fetchImpl }).getByBarcode('7790070410108'),
    ).toBeNull();
  });

  it('lanza FoodSourceError si OFF falla', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('error', { status: 500 }));
    await expect(
      createOffClient({ ...options, fetchImpl }).getByBarcode('7790070410108'),
    ).rejects.toBeInstanceOf(FoodSourceError);
  });
});
