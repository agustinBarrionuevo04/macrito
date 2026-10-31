import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanApiError, requestPlan } from './api';

const snap = { kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 2 };
const ok = {
  status: 'ok',
  remaining: snap,
  options: [
    {
      title: 'Pollo',
      meal: 'dinner',
      totals: snap,
      items: [
        {
          food: {
            id: 'f1',
            name: 'Pollo',
            source: 'ar_seed',
            per100g: { kcal: 165 },
            portions: [],
          },
          grams: 100,
          nutrition: snap,
        },
      ],
    },
  ],
};

const respond = (body: unknown, status = 200) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

const input = { mode: 'meal', meal: 'dinner', date: '2026-03-15' } as const;

describe('requestPlan', () => {
  it('manda el pedido por POST y devuelve la respuesta validada', async () => {
    respond(ok);
    expect(await requestPlan(input)).toMatchObject({ status: 'ok' });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/ai/plan');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(input) });
  });

  it('acepta "reached"', async () => {
    respond({ status: 'reached', remaining: snap });
    expect(await requestPlan(input)).toEqual({ status: 'reached', remaining: snap });
  });

  it('traduce los códigos de error a mensajes para mostrar', async () => {
    const cases: [number, object, RegExp][] = [
      [429, { error: 'quota_exceeded', limit: 100 }, /límite de 100/],
      [429, { error: 'quota_exceeded' }, /límite de análisis/],
      [422, { error: 'no_options' }, /No pudimos armar opciones/],
      [503, { error: 'ai_unavailable' }, /no está disponible/],
      [401, { error: 'unauthorized' }, /sesión venció/],
      [500, { error: 'algo_nuevo' }, /No pudimos completar/],
    ];
    for (const [status, body, expected] of cases) {
      respond(body, status);
      await expect(requestPlan(input)).rejects.toMatchObject({
        name: 'PlanApiError',
        message: expect.stringMatching(expected),
      });
    }
  });

  it('una respuesta sin JSON (un 502 del proxy) da el mensaje genérico', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })));
    await expect(requestPlan(input)).rejects.toBeInstanceOf(PlanApiError);
  });

  it('una respuesta 200 con otra forma se rechaza', async () => {
    respond({ status: 'ok', options: 'x' });
    await expect(requestPlan(input)).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('sin red da el mensaje de conexión y un aborto se propaga', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    await expect(requestPlan(input)).rejects.toMatchObject({ code: 'network' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')));
    await expect(requestPlan(input)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
