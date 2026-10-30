import { afterEach, describe, expect, it, vi } from 'vitest';
import { FoodsApiError, lookupBarcode, searchFoods } from './api';

const food = {
  id: 'f1',
  source: 'off',
  name: 'Leche',
  per100g: { kcal: 60, protein_g: 3, carbs_g: 5, fat_g: 3 },
  portions: [],
};

const respond = (body: unknown, init: ResponseInit = {}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
        ...init,
      }),
    ),
  );

afterEach(() => vi.unstubAllGlobals());

describe('searchFoods', () => {
  it('codifica la consulta y devuelve los alimentos con la marca de degradado', async () => {
    respond([food], { headers: { 'X-Foods-Degraded': '1' } });
    const result = await searchFoods('leche entera & más');
    expect(fetch).toHaveBeenCalledWith(
      '/api/foods/search?q=leche%20entera%20%26%20m%C3%A1s',
      expect.anything(),
    );
    expect(result).toEqual({ foods: [food], degraded: true });
  });

  it('traduce los códigos de error de la API', async () => {
    for (const [status, code, text] of [
      [401, 'unauthorized', 'sesión venció'],
      [429, 'rate_limited', 'muchas búsquedas'],
      [503, 'sources_unavailable', 'catálogos'],
      [500, 'internal', 'No pudimos buscar'],
    ] as const) {
      respond({ error: code }, { status });
      await expect(searchFoods('leche')).rejects.toSatisfy(
        (e) => e instanceof FoodsApiError && e.code === code && e.message.includes(text),
      );
    }
  });

  it('una respuesta de error sin JSON da el mensaje genérico', async () => {
    respond(undefined, { status: 502 });
    await expect(searchFoods('leche')).rejects.toMatchObject({
      code: 'generic',
      message: expect.stringContaining('No pudimos buscar'),
    });
  });

  it('sin red habla de conexión; una cancelación se propaga tal cual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(searchFoods('leche')).rejects.toMatchObject({ code: 'network' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')));
    await expect(searchFoods('leche')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('una respuesta con otra forma no se acepta', async () => {
    respond([{ ...food, per100g: { kcal: 'mucho' } }]);
    await expect(searchFoods('leche')).rejects.toBeInstanceOf(FoodsApiError);
    respond({ foods: [] });
    await expect(searchFoods('leche')).rejects.toBeInstanceOf(FoodsApiError);
  });
});

describe('lookupBarcode', () => {
  it('devuelve el producto o null', async () => {
    respond(food);
    expect(await lookupBarcode('7790001000019')).toEqual(food);
    respond(null);
    expect(await lookupBarcode('7790001000019')).toBeNull();
  });

  it('traduce errores con los textos del escaneo', async () => {
    respond({ error: 'invalid_barcode' }, { status: 400 });
    await expect(lookupBarcode('x')).rejects.toMatchObject({
      code: 'invalid_barcode',
      message: expect.stringContaining('código no es válido'),
    });
    respond({ error: 'rate_limited' }, { status: 429 });
    await expect(lookupBarcode('x')).rejects.toMatchObject({
      message: expect.stringContaining('consultas seguidas'),
    });
  });

  it('un producto con forma inválida es un error, no un null', async () => {
    respond({ id: 'f1' });
    await expect(lookupBarcode('x')).rejects.toBeInstanceOf(FoodsApiError);
  });
});
