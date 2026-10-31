import { describe, expect, it, vi } from 'vitest';
import { createAnthropicProvider } from './anthropic';
import { TOOL_NAME } from './schema';
import { AiError, type AiContent } from './types';

const PHOTO: AiContent = { kind: 'photo', mediaType: 'image/jpeg', base64: 'QUJD' };
const TEXT: AiContent = { kind: 'text', text: '2 milanesas con puré' };

const toolReply = (input: unknown, usage = { input_tokens: 1200, output_tokens: 80 }) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: TOOL_NAME, input }], usage }), {
    status: 200,
  });

const make = (response: () => Promise<Response> | Response, extra = {}) => {
  const fetchMock = vi.fn().mockImplementation(async () => response());
  return {
    fetchMock,
    provider: createAnthropicProvider({
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

describe('createAnthropicProvider', () => {
  it('manda el pedido forzando la herramienta y la imagen antes del texto', async () => {
    const { provider, fetchMock } = make(() => toolReply({ items: [] }));
    await provider.analyze(PHOTO, 'sistema');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('key-123');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: 'modelo-x',
      system: 'sistema',
      tool_choice: { type: 'tool', name: TOOL_NAME },
    });
    expect(body.tools[0].name).toBe(TOOL_NAME);
    expect(body.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' },
    });
    expect(body.messages[0].content[1].type).toBe('text');
  });

  it('el texto se manda como un solo bloque de texto', async () => {
    const { provider, fetchMock } = make(() => toolReply({ items: [] }));
    await provider.analyze(TEXT, 's');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).messages[0].content).toEqual([
      { type: 'text', text: '2 milanesas con puré' },
    ]);
  });

  it('devuelve lo que trae la herramienta y los tokens usados', async () => {
    const { provider } = make(() => toolReply({ items: [{ query: 'milanesa' }] }));
    expect(await provider.analyze(TEXT, 's')).toMatchObject({
      raw: { items: [{ query: 'milanesa' }] },
      usage: { inputTokens: 1200, outputTokens: 80 },
    });
  });

  it('tokens ausentes o raros cuentan como 0', async () => {
    const { provider } = make(() =>
      toolReply({ items: [] }, { input_tokens: 'x' as never, output_tokens: -5 }),
    );
    expect((await provider.analyze(TEXT, 's')).usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('usa la URL base configurada (sin barra final duplicada)', async () => {
    const { provider, fetchMock } = make(() => toolReply({ items: [] }), {
      baseUrl: 'http://localhost:9/',
    });
    await provider.analyze(TEXT, 's');
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:9/v1/messages');
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
      [529, PHOTO, 'unavailable'],
    ];
    for (const [status, content, code] of cases) {
      const { provider } = make(() => new Response('{}', { status }));
      expect(await codeOf(provider.analyze(content, 's')), `${status} ${content.kind}`).toBe(code);
    }
  });

  it('una respuesta sin datos legibles es un error de respuesta, con la forma de lo recibido', async () => {
    for (const response of [
      () =>
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'hola' }] }), {
          status: 200,
        }),
      () =>
        new Response(JSON.stringify({ content: [], stop_reason: 'max_tokens' }), { status: 200 }),
      () => new Response(JSON.stringify({}), { status: 200 }),
      () => new Response('<html>', { status: 200 }),
    ]) {
      const { provider } = make(response);
      expect(await codeOf(provider.analyze(TEXT, 's'))).toBe('bad_response');
    }
    const { provider } = make(
      () =>
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: 'hola' }], stop_reason: 'end_turn' }),
          { status: 200 },
        ),
    );
    const error = await provider.analyze(TEXT, 's').catch((e: unknown) => e);
    expect((error as Error).message).toContain('stop_reason=end_turn');
    expect((error as Error).message).toContain('bloques=[text]');
  });

  it('si el modelo contestó con texto que trae el JSON, se aprovecha en vez de descartarlo', async () => {
    const reply = (text: string) =>
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text }],
          usage: { input_tokens: 5, output_tokens: 7 },
        }),
        { status: 200 },
      );
    const { provider } = make(() => reply('Claro:\n```json\n{"items":[{"query":"pan"}]}\n```'));
    const result = await provider.analyze(TEXT, 's');
    expect(result.raw).toEqual({ items: [{ query: 'pan' }] });
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
    expect(result.diagnostics).toContain('origen=texto');
  });

  it('si llamó a otra herramienta, se usa su contenido', async () => {
    const { provider } = make(
      () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'tool_use', name: 'otra', input: { foods: [{ name: 'pan' }] } }],
          }),
          { status: 200 },
        ),
    );
    const result = await provider.analyze(TEXT, 's');
    expect(result.raw).toEqual({ foods: [{ name: 'pan' }] });
    expect(result.diagnostics).toContain('origen=herramienta otra');
  });

  it('el diagnóstico describe la forma de la respuesta sin su contenido', async () => {
    const { provider } = make(() => toolReply({ items: [{ query: 'milanesa secreta' }] }));
    const { diagnostics } = await provider.analyze(TEXT, 's');
    expect(diagnostics).toContain('origen=herramienta');
    expect(diagnostics).toContain('items: array(1 de {query: string(16)})');
    expect(diagnostics).not.toContain('milanesa');
  });

  it('pide margen suficiente de tokens para varios ítems', async () => {
    const { provider, fetchMock } = make(() => toolReply({ items: [] }));
    await provider.analyze(TEXT, 's');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).max_tokens).toBeGreaterThanOrEqual(2048);
  });

  it('los errores HTTP incluyen lo que dijo la API (sin la clave)', async () => {
    const apiError = (status: number) =>
      new Response(
        JSON.stringify({
          type: 'error',
          error: { type: 'invalid_request_error', message: 'model: nombre inválido' },
        }),
        { status },
      );
    const { provider } = make(() => apiError(400));
    const error = await provider.analyze(TEXT, 's').catch((e: unknown) => e);
    expect((error as AiError).code).toBe('bad_response');
    expect((error as Error).message).toContain('HTTP 400');
    expect((error as Error).message).toContain('invalid_request_error: model: nombre inválido');
    expect((error as Error).message).not.toContain('key-123');
    const unreadable = make(() => new Response('no json', { status: 500 }));
    const second = await unreadable.provider.analyze(TEXT, 's').catch((e: unknown) => e);
    expect((second as Error).message).toBe('HTTP 500');
  });

  it('un 400 por saldo agotado es "unavailable", también con foto', async () => {
    const noCredit = () =>
      new Response(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Your credit balance is too low to access the Anthropic API.',
          },
        }),
        { status: 400 },
      );
    for (const content of [TEXT, PHOTO]) {
      const { provider } = make(noCredit);
      expect(await codeOf(provider.analyze(content, 's')), content.kind).toBe('unavailable');
    }
  });

  it('un fallo de red es "unavailable"', async () => {
    const { provider } = make(() => Promise.reject(new TypeError('fetch failed')));
    expect(await codeOf(provider.analyze(TEXT, 's'))).toBe('unavailable');
  });

  it('si el proveedor no responde a tiempo es "timeout"', async () => {
    // Un fetch que respeta la señal: se rechaza al vencer el plazo.
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
        }),
    );
    const withSignal = createAnthropicProvider({
      apiKey: 'k',
      model: 'm',
      timeoutMs: 20,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(await codeOf(withSignal.analyze(TEXT, 's'))).toBe('timeout');
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
    const tool = { name: 'suggest_meals', description: 'd', schema: { type: 'object' } };
    const { provider, fetchMock } = make(
      () =>
        new Response(
          JSON.stringify({
            content: [
              { type: 'tool_use', name: TOOL_NAME, input: { equivocada: true } },
              { type: 'tool_use', name: 'suggest_meals', input: { options: [] } },
            ],
            usage: { input_tokens: 10, output_tokens: 2 },
          }),
          { status: 200 },
        ),
    );
    const analysis = await provider.analyze(TEXT, 's', undefined, tool);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'suggest_meals' });
    expect(body.tools).toEqual([
      { name: 'suggest_meals', description: 'd', input_schema: { type: 'object' } },
    ]);
    expect(analysis.raw).toEqual({ options: [] });
  });
});
