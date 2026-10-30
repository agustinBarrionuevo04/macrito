import { TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA } from './schema';
import { AiError, type AiAnalysis, type AiContent, type AiProvider } from './types';

const API_VERSION = '2023-06-01';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_TOKENS = 1024;

export type AnthropicOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Para tests. */
  fetch?: typeof fetch;
};

function requestBody(model: string, content: AiContent, system: string) {
  // Anthropic recomienda la imagen antes del texto.
  const message =
    content.kind === 'photo'
      ? [
          {
            type: 'image',
            source: { type: 'base64', media_type: content.mediaType, data: content.base64 },
          },
          { type: 'text', text: 'Listá los alimentos de esta foto.' },
        ]
      : [{ type: 'text', text: content.text }];

  return {
    model,
    max_tokens: MAX_TOKENS,
    system,
    tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: TOOL_SCHEMA }],
    // Fuerza la llamada a la herramienta: la salida es siempre estructurada.
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: message }],
  };
}

function errorForStatus(status: number, content: AiContent): AiError {
  if (status === 401 || status === 403) return new AiError('unauthorized', `HTTP ${status}`);
  if (status === 429) return new AiError('rate_limited', 'HTTP 429');
  if (status === 413) return new AiError('image_rejected', 'HTTP 413');
  if (status === 400) {
    return content.kind === 'photo'
      ? new AiError('image_rejected', 'HTTP 400')
      : new AiError('bad_response', 'HTTP 400');
  }
  return new AiError('unavailable', `HTTP ${status}`);
}

/** Proveedor Anthropic (Messages API) con salida forzada por herramienta. */
export function createAnthropicProvider(options: AnthropicOptions): AiProvider {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async analyze(content, system, signal): Promise<AiAnalysis> {
      const timeout = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': API_VERSION,
          },
          body: JSON.stringify(requestBody(options.model, content, system)),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        if (timeout.aborted)
          throw new AiError('timeout', 'el proveedor no respondió a tiempo', { cause: error });
        throw new AiError('unavailable', 'no se pudo conectar con el proveedor', { cause: error });
      }

      if (!response.ok) throw errorForStatus(response.status, content);

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        throw new AiError('bad_response', 'respuesta que no es JSON', { cause: error });
      }
      return readResponse(body);
    },
  };
}

function readResponse(body: unknown): AiAnalysis {
  const record = body as {
    content?: { type?: string; name?: string; input?: unknown }[];
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  };
  const call = Array.isArray(record?.content)
    ? record.content.find((block) => block?.type === 'tool_use' && block.name === TOOL_NAME)
    : undefined;
  if (!call) throw new AiError('bad_response', 'la respuesta no llamó a la herramienta');

  const tokens = (value: unknown) =>
    typeof value === 'number' && value > 0 ? Math.round(value) : 0;
  return {
    raw: call.input,
    usage: {
      inputTokens: tokens(record.usage?.input_tokens),
      outputTokens: tokens(record.usage?.output_tokens),
    },
  };
}
