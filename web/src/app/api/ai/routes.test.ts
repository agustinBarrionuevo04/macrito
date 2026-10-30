import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError } from '@/lib/ai/types';
import { QuotaExceededError } from '@/lib/ai/service';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  timezone: 'America/Argentina/Cordoba' as string | null,
  analyzePhoto: vi.fn(),
  analyzeText: vi.fn(),
  getAiService: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: h.timezone ? { timezone: h.timezone } : null }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/ai/server', () => ({ getAiService: h.getAiService }));

const { POST: photoRoute, MAX_IMAGE_BYTES } = await import('./photo/route');
const { POST: textRoute } = await import('./text/route');

const EXIF = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const JPEG = Uint8Array.from([
  0xff,
  0xd8,
  ...EXIF,
  0xff,
  0xdb,
  0x00,
  0x04,
  0,
  0,
  0xff,
  0xda,
  0x00,
  0x04,
  1,
  1,
  0x12,
  0xff,
  0xd9,
]);

const photoRequest = (file?: File | string | null, headers: Record<string, string> = {}) => {
  const form = new FormData();
  if (file !== undefined && file !== null) form.set('image', file);
  return new NextRequest('http://localhost/api/ai/photo', { method: 'POST', body: form, headers });
};
const jpegFile = (bytes: Uint8Array = JPEG) =>
  new File([bytes as BlobPart], 'comida.jpg', { type: 'image/jpeg' });
const textRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/ai/text', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

const items = [{ query: 'milanesa', est_grams: 200, confidence: 'high' }];

beforeEach(() => {
  vi.clearAllMocks();
  h.timezone = 'America/Argentina/Cordoba';
  h.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  h.analyzePhoto.mockResolvedValue(items);
  h.analyzeText.mockResolvedValue(items);
  h.getAiService.mockReturnValue({ analyzePhoto: h.analyzePhoto, analyzeText: h.analyzeText });
});

describe('POST /api/ai/photo', () => {
  it('sin sesión responde 401 y no gasta nada', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    const response = await photoRoute(photoRequest(jpegFile()));
    expect(response.status).toBe(401);
    expect(h.getAiService).not.toHaveBeenCalled();
  });

  it('devuelve los ítems y manda al modelo la imagen SIN metadatos', async () => {
    const response = await photoRoute(photoRequest(jpegFile()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items });
    const [userId, day, bytes] = h.analyzePhoto.mock.calls[0]!;
    expect(userId).toBe('user-1');
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Buffer.from(bytes).includes(Buffer.from('Exif'))).toBe(false);
    expect(bytes.length).toBeLessThan(JPEG.length);
  });

  it('rechaza lo que no es una imagen del formulario (sin campo, texto, otro formato)', async () => {
    expect((await photoRoute(photoRequest())).status).toBe(400);
    expect((await photoRoute(photoRequest('texto'))).status).toBe(400);
    const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], 'a.jpg', {
      type: 'image/jpeg', // el tipo declarado miente: se mira el contenido
    });
    const response = await photoRoute(photoRequest(png));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'unsupported_type' });
    expect(h.getAiService).not.toHaveBeenCalled();
  });

  it('rechaza imágenes de más de 2 MB, por tamaño real y por encabezado', async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(JPEG);
    expect((await photoRoute(photoRequest(jpegFile(big)))).status).toBe(413);
    const declared = await photoRoute(
      photoRequest(jpegFile(), { 'content-length': String(MAX_IMAGE_BYTES * 3) }),
    );
    expect(declared.status).toBe(413);
    expect(h.getAiService).not.toHaveBeenCalled();
  });

  it('un cuerpo que no es multipart es un pedido inválido', async () => {
    const request = new NextRequest('http://localhost/api/ai/photo', {
      method: 'POST',
      body: 'hola',
    });
    expect((await photoRoute(request)).status).toBe(400);
  });

  it.each([
    [new QuotaExceededError('photo', 20), 429, 'quota_exceeded'],
    [new AiError('not_configured', 'x'), 503, 'ai_not_configured'],
    [new AiError('unavailable', 'x'), 503, 'ai_unavailable'],
    [new AiError('rate_limited', 'x'), 503, 'ai_unavailable'],
    [new AiError('unauthorized', 'x'), 503, 'ai_unavailable'],
    [new AiError('timeout', 'x'), 504, 'ai_timeout'],
    [new AiError('bad_response', 'x'), 502, 'ai_bad_response'],
    [new AiError('image_rejected', 'x'), 422, 'image_rejected'],
    [new Error('inesperado'), 500, 'internal'],
  ])('traduce el error %# a HTTP', async (error, status, code) => {
    h.analyzePhoto.mockRejectedValue(error);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await photoRoute(photoRequest(jpegFile()));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error).toBe(code);
    expect(JSON.stringify(body)).not.toContain('inesperado');
  });

  it('registra el motivo de un error del modelo (código y detalle) en el servidor', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.analyzePhoto.mockRejectedValue(
      new AiError('bad_response', 'HTTP 400 (invalid_request_error: x)'),
    );
    await photoRoute(photoRequest(jpegFile()));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ai/photo: bad_response: HTTP 400'));
  });

  it('el límite diario informa cuál es', async () => {
    h.analyzePhoto.mockRejectedValue(new QuotaExceededError('photo', 20));
    expect(await (await photoRoute(photoRequest(jpegFile()))).json()).toEqual({
      error: 'quota_exceeded',
      limit: 20,
    });
  });

  it('si falta la clave, lanzar al armar el servicio también es "no configurado"', async () => {
    h.getAiService.mockImplementation(() => {
      throw new AiError('not_configured', 'falta AI_API_KEY');
    });
    const response = await photoRoute(photoRequest(jpegFile()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'ai_not_configured' });
  });

  it('una zona horaria inválida en el perfil no rompe: usa la de Córdoba', async () => {
    h.timezone = 'No/Existe';
    expect((await photoRoute(photoRequest(jpegFile()))).status).toBe(200);
  });
});

describe('POST /api/ai/text', () => {
  it('devuelve los ítems del texto recortado', async () => {
    const response = await textRoute(textRequest({ text: '  2 milanesas con puré ' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items });
    expect(h.analyzeText.mock.calls[0]![2]).toBe('2 milanesas con puré');
  });

  it('sin sesión 401', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    expect((await textRoute(textRequest({ text: 'hola' }))).status).toBe(401);
  });

  it.each([
    null,
    {},
    { text: 5 },
    { text: '' },
    { text: ' a ' },
    { text: 'x'.repeat(501) },
    'no-json',
  ])('pedido inválido (%j) responde 400 sin llamar al modelo', async (body) => {
    expect((await textRoute(textRequest(body))).status).toBe(400);
    expect(h.getAiService).not.toHaveBeenCalled();
  });

  it('traduce el límite diario', async () => {
    h.analyzeText.mockRejectedValue(new QuotaExceededError('text', 100));
    const response = await textRoute(textRequest({ text: 'milanesa' }));
    expect(response.status).toBe(429);
  });
});
