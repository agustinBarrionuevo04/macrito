import { describe, expect, it, vi } from 'vitest';
import { createGeminiProvider } from './gemini';
import { TOOL_NAME } from './schema';
import { AiError, type AiContent } from './types';

const PHOTO: AiContent = { kind: 'photo', mediaType: 'image/jpeg', base64: 'QUJD' };
const TEXT: AiContent = { kind: 'text', text: '2 milanesas con puré' };

const reply = (parts: unknown[], extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80 },
      ...extra,
    }),
    { status: 200 },
  );

const callReply = (args: unknown) => reply([{ functionCall: { name: TOOL_NAME, args } }]);

const make = (response: () => Promise<Response> | Response, extra = {}) => {
  const fetchMock = vi.fn().mockImplementation(async () => response());
  return {
    fetchMock,
    provider: createGeminiProvider({
      apiKey: 'key-123',
      model: 'modelo-x',
      fetch: fetchMock as unknown as typeof fetch,
      ...extra,
    }),
  };
};

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof AiError ? error.code : 'other';
  }
  return null;
};

describe('createGeminiProvider', () => {
  it('manda el pedido forzando la función, con la clave en el encabezado y no en la URL', async () => {
    const { provider, fetchMock } = make(() => callReply({ items: [] }));
    await provider.analyze(PHOTO, 'sistema');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/modelo-x:generateContent',
    );
    expect(url).not.toContain('key-123');
    expect(init.headers['x-goog-api-key']).toBe('key-123');
    const body = JSON.parse(init.body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sistema' }] });
    expect(body.toolConfig).toEqual({
      functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [TOOL_NAME] },
    });
    expect(body.tools[0].functionDeclarations[0].name).toBe(TOOL_NAME);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'image/jpeg', data: 'QUJD' },
    });
    expect(body.contents[0].parts[1].text).toEqual(expect.any(String));
  });

  it('el texto se manda como una sola parte de texto', async () => {
    const { provider, fetchMock } = make(() => callReply({ items: [] }));
    await provider.analyze(TEXT, 's');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).contents[0].parts).toEqual([
      { text: '2 milanesas con puré' },
    ]);
  });

  it('el esquema de la función no lleva additionalProperties, que Gemini rechaza', async () => {
    const { provider, fetchMock } = make(() => callReply({ items: [] }));
    await provider.analyze(TEXT, 's');
    const declaration = JSON.parse(fetchMock.mock.calls[0]![1].body).tools[0]
      .functionDeclarations[0];
    expect(JSON.stringify(declaration)).not.toContain('additionalProperties');
    expect(declaration.parameters.properties.items.items.required).toEqual(['query', 'confidence']);
  });

  it('devuelve lo que trae la función y los tokens usados', async () => {
    const { provider } = make(() => callReply({ items: [{ query: 'milanesa' }] }));
    expect(await provider.analyze(TEXT, 's')).toMatchObject({
      raw: { items: [{ query: 'milanesa' }] },
      usage: { inputTokens: 1200, outputTokens: 80 },
    });
  });

  it('tokens ausentes o raros cuentan como 0', async () => {
    const { provider } = make(() =>
      reply([{ functionCall: { name: TOOL_NAME, args: { items: [] } } }], {
        usageMetadata: { promptTokenCount: 'x', candidatesTokenCount: -5 },
      }),
    );
    expect((await provider.analyze(TEXT, 's')).usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('usa la URL base configurada (sin barra final duplicada)', async () => {
    const { provider, fetchMock } = make(() => callReply({ items: [] }), {
      baseUrl: 'http://localhost:9/',
    });
    await provider.analyze(TEXT, 's');
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'http://localhost:9/v1beta/models/modelo-x:generateContent',
    );
  });

  it('traduce los códigos HTTP', async () => {
    const cases: [number, AiContent, string][] = [
      [401, TEXT, 'unauthorized'],
      [403, TEXT, 'unauthorized'],
      [429, TEXT, 'rate_limited'],
      [413, PHOTO, 'image_rejected'],
      [400, PHOTO, 'image_rejected'],
      [400, TEXT, 'bad_response'],
      [500, TEXT, 'unavailable'],
      [503, PHOTO, 'unavailable'],
    ];
    for (const [status, content, code] of cases) {
      const { provider } = make(() => new Response('{}', { status }));
      expect(await codeOf(provider.analyze(content, 's')), `${status} ${content.kind}`).toBe(code);
    }
  });

  it('un 400 por clave inválida es "unauthorized" y uno por región sin acceso "unavailable"', async () => {
    const apiError = (status: string, message: string) => () =>
      new Response(JSON.stringify({ error: { code: 400, status, message } }), { status: 400 });
    const invalid = make(
      apiError('INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.'),
    );
    expect(await codeOf(invalid.provider.analyze(PHOTO, 's'))).toBe('unauthorized');
    const region = make(
      apiError('FAILED_PRECONDITION', 'User location is not supported for the API use.'),
    );
    expect(await codeOf(region.provider.analyze(TEXT, 's'))).toBe('unavailable');
  });

  it('los errores HTTP incluyen lo que dijo la API (sin la clave)', async () => {
    const { provider } = make(
      () =>
        new Response(
          JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'schema inválido' } }),
          { status: 400 },
        ),
    );
    const error = await provider.analyze(TEXT, 's').catch((e: unknown) => e);
    expect((error as AiError).code).toBe('bad_response');
    expect((error as Error).message).toContain('HTTP 400');
    expect((error as Error).message).toContain('INVALID_ARGUMENT: schema inválido');
    expect((error as Error).message).not.toContain('key-123');
    const unreadable = make(() => new Response('no json', { status: 500 }));
    const second = await unreadable.provider.analyze(TEXT, 's').catch((e: unknown) => e);
    expect((second as Error).message).toBe('HTTP 500');
  });

  it('una respuesta sin datos legibles es un error de respuesta, con la forma de lo recibido', async () => {
    for (const response of [
      () => reply([{ text: 'hola' }]),
      () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
      () => new Response(JSON.stringify({}), { status: 200 }),
      () => new Response('<html>', { status: 200 }),
    ]) {
      const { provider } = make(response);
      expect(await codeOf(provider.analyze(TEXT, 's'))).toBe('bad_response');
    }
    const blocked = make(
      () =>
        new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), {
          status: 200,
        }),
    );
    const error = await blocked.provider.analyze(TEXT, 's').catch((e: unknown) => e);
    expect((error as Error).message).toContain('bloqueado=SAFETY');
    const cut = make(
      () =>
        new Response(
          JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }),
          { status: 200 },
        ),
    );
    const second = await cut.provider.analyze(TEXT, 's').catch((e: unknown) => e);
    expect((second as Error).message).toContain('finishReason=MAX_TOKENS');
  });

  it('si el modelo contestó con texto que trae el JSON, se aprovecha en vez de descartarlo', async () => {
    const { provider } = make(() =>
      reply([{ text: 'Claro:\n```json\n{"items":[{"query":"pan"}]}\n```' }]),
    );
    const result = await provider.analyze(TEXT, 's');
    expect(result.raw).toEqual({ items: [{ query: 'pan' }] });
    expect(result.diagnostics).toContain('origen=texto');
  });

  it('si llamó a otra función, se usa su contenido', async () => {
    const { provider } = make(() =>
      reply([{ functionCall: { name: 'otra', args: { foods: [{ name: 'pan' }] } } }]),
    );
    const result = await provider.analyze(TEXT, 's');
    expect(result.raw).toEqual({ foods: [{ name: 'pan' }] });
    expect(result.diagnostics).toContain('origen=herramienta otra');
  });

  it('el diagnóstico describe la forma de la respuesta sin su contenido', async () => {
    const { provider } = make(() => callReply({ items: [{ query: 'milanesa secreta' }] }));
    const { diagnostics } = await provider.analyze(TEXT, 's');
    expect(diagnostics).toContain('origen=herramienta');
    expect(diagnostics).toContain('finishReason=STOP');
    expect(diagnostics).not.toContain('milanesa');
  });

  it('un fallo de red es "unavailable"', async () => {
    const { provider } = make(() => Promise.reject(new TypeError('fetch failed')));
    expect(await codeOf(provider.analyze(TEXT, 's'))).toBe('unavailable');
  });

  it('si el proveedor no responde a tiempo es "timeout"', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
        }),
    );
    const slow = createGeminiProvider({
      apiKey: 'k',
      model: 'm',
      timeoutMs: 20,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(await codeOf(slow.analyze(TEXT, 's'))).toBe('timeout');
  });

  it('la clave no aparece en los mensajes de error', async () => {
    const { provider } = make(() => new Response('{}', { status: 401 }));
    const error = await provider.analyze(TEXT, 's').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(JSON.stringify(error) + (error as Error).message + (error as Error).stack).not.toContain(
      'key-123',
    );
  });

  it('con otra herramienta la fuerza y lee su llamada (no la de comidas)', async () => {
    const tool = {
      name: 'suggest_meals',
      description: 'd',
      schema: { type: 'object', additionalProperties: false, properties: {} },
    };
    const { provider, fetchMock } = make(() =>
      reply([
        { functionCall: { name: TOOL_NAME, args: { equivocada: true } } },
        { functionCall: { name: 'suggest_meals', args: { options: [] } } },
      ]),
    );
    const analysis = await provider.analyze(TEXT, 's', undefined, tool);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.toolConfig.functionCallingConfig.allowedFunctionNames).toEqual(['suggest_meals']);
    expect(body.tools[0].functionDeclarations[0]).toEqual({
      name: 'suggest_meals',
      description: 'd',
      parameters: { type: 'object', properties: {} },
    });
    expect(analysis.raw).toEqual({ options: [] });
  });
});
