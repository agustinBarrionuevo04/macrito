import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodSourceError } from '@/lib/foods/types';

const getUser = vi.fn();
const search = vi.fn();
const barcode = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/foods/server', () => ({
  getFoodService: async () => ({ search, barcode }),
}));

const { GET: searchRoute } = await import('./search/route');
const { GET: barcodeRoute } = await import('./barcode/[code]/route');

let userCounter = 0;
const signIn = () =>
  getUser.mockResolvedValue({ data: { user: { id: `user-${(userCounter += 1)}` } } });
const signOut = () => getUser.mockResolvedValue({ data: { user: null } });

const searchRequest = (q?: string) =>
  new NextRequest(
    `http://localhost/api/foods/search${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}`,
  );
const barcodeRequest = (code: string) =>
  new NextRequest(`http://localhost/api/foods/barcode/${code}`);
const params = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.clearAllMocks();
  signIn();
});

describe('GET /api/foods/search', () => {
  it('sin sesión responde 401 y no consulta nada', async () => {
    signOut();
    const response = await searchRoute(searchRequest('leche'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(search).not.toHaveBeenCalled();
  });

  it.each([undefined, '', ' ', 'a', 'x'.repeat(81)])(
    'consulta inválida (%j) responde 400',
    async (q) => {
      const response = await searchRoute(searchRequest(q));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_query' });
      expect(search).not.toHaveBeenCalled();
    },
  );

  it('devuelve Food[] y recorta la consulta', async () => {
    search.mockResolvedValue({ foods: [{ id: 'f1', name: 'Leche' }], degraded: false });
    const response = await searchRoute(searchRequest('  leche  '));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 'f1', name: 'Leche' }]);
    expect(response.headers.get('X-Foods-Degraded')).toBeNull();
    expect(search).toHaveBeenCalledWith('leche');
  });

  it('marca la respuesta degradada si una fuente falló', async () => {
    search.mockResolvedValue({ foods: [], degraded: true });
    const response = await searchRoute(searchRequest('leche'));
    expect(response.headers.get('X-Foods-Degraded')).toBe('1');
  });

  it('responde 503 si no respondió ninguna fuente', async () => {
    search.mockRejectedValue(new FoodSourceError('off', 'caído'));
    const response = await searchRoute(searchRequest('leche'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'sources_unavailable' });
  });

  it('responde 500 ante un error inesperado, sin filtrar el detalle', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    search.mockRejectedValue(new Error('detalle interno secreto'));
    const response = await searchRoute(searchRequest('leche'));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secreto');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('limita a 30 pedidos por minuto y usuario, con Retry-After', async () => {
    search.mockResolvedValue({ foods: [], degraded: false });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1)
      statuses.push((await searchRoute(searchRequest('leche'))).status);

    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);

    const blocked = await searchRoute(searchRequest('leche'));
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(await blocked.json()).toEqual({ error: 'rate_limited' });

    // Otro usuario no se ve afectado.
    signIn();
    expect((await searchRoute(searchRequest('leche'))).status).toBe(200);
  });
});

describe('GET /api/foods/barcode/:code', () => {
  it('sin sesión responde 401', async () => {
    signOut();
    expect(
      (await barcodeRoute(barcodeRequest('7790070410108'), params('7790070410108'))).status,
    ).toBe(401);
    expect(barcode).not.toHaveBeenCalled();
  });

  it('un código inválido (dígito verificador) responde 400', async () => {
    const response = await barcodeRoute(barcodeRequest('7790070410105'), params('7790070410105'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_barcode' });
    expect(barcode).not.toHaveBeenCalled();
  });

  it('normaliza el código (UPC-A → EAN-13) y devuelve el alimento', async () => {
    barcode.mockResolvedValue({ id: 'f1', name: 'Gaseosa' });
    const response = await barcodeRoute(barcodeRequest('036000291452'), params('036000291452'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'f1', name: 'Gaseosa' });
    expect(barcode).toHaveBeenCalledWith('0036000291452');
  });

  it('un producto desconocido responde 200 con null (contrato Food | null)', async () => {
    barcode.mockResolvedValue(null);
    const response = await barcodeRoute(barcodeRequest('7790070410108'), params('7790070410108'));
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it('responde 503 si OFF no responde y 500 ante un error inesperado', async () => {
    barcode.mockRejectedValueOnce(new FoodSourceError('off', 'caído'));
    expect(
      (await barcodeRoute(barcodeRequest('7790070410108'), params('7790070410108'))).status,
    ).toBe(503);

    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    barcode.mockRejectedValueOnce(new Error('boom'));
    expect(
      (await barcodeRoute(barcodeRequest('7790070410108'), params('7790070410108'))).status,
    ).toBe(500);
    log.mockRestore();
  });

  it('limita a 30 pedidos por minuto y usuario', async () => {
    barcode.mockResolvedValue(null);
    let last = 0;
    for (let i = 0; i < 31; i += 1) {
      last = (await barcodeRoute(barcodeRequest('7790070410108'), params('7790070410108'))).status;
    }
    expect(last).toBe(429);
  });
});
