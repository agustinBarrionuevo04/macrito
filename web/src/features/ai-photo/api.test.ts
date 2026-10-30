import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiApiError, analyzePhoto, analyzeText } from './api';

const item = { query: 'milanesa', est_grams: 200, confidence: 'high' };

const respond = (body: unknown, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(body === undefined ? null : JSON.stringify(body), { status }),
      ),
  );

afterEach(() => vi.unstubAllGlobals());

describe('analyzePhoto / analyzeText', () => {
  it('la foto se manda como multipart con el campo "image"', async () => {
    respond({ items: [item] });
    const result = await analyzePhoto(new Blob(['x'], { type: 'image/jpeg' }));
    expect(result).toEqual([item]);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/ai/photo');
    expect((init!.body as FormData).get('image')).toBeInstanceOf(Blob);
  });

  it('el texto se manda como JSON', async () => {
    respond({ items: [] });
    expect(await analyzeText('2 milanesas')).toEqual([]);
    const init = vi.mocked(fetch).mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toEqual({ text: '2 milanesas' });
  });

  it('traduce cada código de error a un mensaje claro', async () => {
    const cases: [number, string, string][] = [
      [429, 'quota_exceeded', 'límite'],
      [503, 'ai_not_configured', 'todavía no está disponible'],
      [503, 'ai_unavailable', 'no está disponible ahora'],
      [504, 'ai_timeout', 'tardó demasiado'],
      [502, 'ai_bad_response', 'entender la respuesta'],
      [422, 'image_rejected', 'procesar esa foto'],
      [413, 'too_large', 'muy pesada'],
      [415, 'unsupported_type', 'no es una foto'],
      [401, 'unauthorized', 'sesión venció'],
    ];
    for (const [status, error, text] of cases) {
      respond({ error }, status);
      await expect(analyzeText('x')).rejects.toSatisfy(
        (e) => e instanceof AiApiError && e.code === error && e.message.includes(text),
      );
    }
  });

  it('el límite diario dice cuál es', async () => {
    respond({ error: 'quota_exceeded', limit: 20 }, 429);
    await expect(analyzeText('x')).rejects.toMatchObject({
      message: expect.stringContaining('20 análisis'),
    });
  });

  it('una respuesta de error sin JSON o con un código desconocido da el mensaje genérico', async () => {
    respond(undefined, 502);
    await expect(analyzeText('x')).rejects.toMatchObject({ code: 'generic' });
    respond({ error: 'algo_nuevo' }, 500);
    await expect(analyzeText('x')).rejects.toMatchObject({
      message: expect.stringContaining('No pudimos analizar'),
    });
  });

  it('sin red avisa de la conexión; una cancelación se propaga', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(analyzeText('x')).rejects.toMatchObject({ code: 'network' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')));
    await expect(analyzeText('x')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('una respuesta exitosa con otra forma no se acepta', async () => {
    for (const body of [{ items: [{ query: 'x' }] }, { items: 'x' }, [], null]) {
      respond(body);
      await expect(analyzeText('x')).rejects.toBeInstanceOf(AiApiError);
    }
  });
});
