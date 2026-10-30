import { describeShape, extractJsonValue } from './extract';
import { TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA } from './schema';
import { AiError, type AiAnalysis, type AiContent, type AiProvider } from './types';

const API_VERSION = '2023-06-01';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_TIMEOUT_MS = 25_000;
// Con varios ítems y sus valores por 100 g, 1024 se queda corto y la respuesta llega cortada.
const MAX_TOKENS = 2048;

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

/** Mensaje de error que devuelve la API (`{ error: { type, message } }`). No incluye datos del usuario ni la clave. */
async function apiErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const error = (body as { error?: { type?: unknown; message?: unknown } } | null)?.error;
    const type = typeof error?.type === 'string' ? error.type : '';
    const message = typeof error?.message === 'string' ? error.message : '';
    return [type, message].filter(Boolean).join(': ').slice(0, 300);
  } catch {
    return '';
  }
}

async function errorForStatus(response: Response, content: AiContent): Promise<AiError> {
  const status = response.status;
  const detail = await apiErrorDetail(response);
  const message = detail ? `HTTP ${status} (${detail})` : `HTTP ${status}`;
  if (status === 401 || status === 403) return new AiError('unauthorized', message);
  if (status === 429) return new AiError('rate_limited', message);
  if (status === 413) return new AiError('image_rejected', message);
  if (status === 400) {
    return content.kind === 'photo'
      ? new AiError('image_rejected', message)
      : new AiError('bad_response', message);
  }
  return new AiError('unavailable', message);
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

      if (!response.ok) throw await errorForStatus(response, content);

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

type Block = { type?: string; name?: string; input?: unknown; text?: unknown };

/**
 * Saca de la respuesta lo que devolvió el modelo. Lo normal es la llamada a la herramienta; si el
 * modelo contestó con texto (o con otra herramienta) se busca el JSON ahí, para no tirar una
 * respuesta que ya se pagó. La forma de lo recibido se guarda en `diagnostics` (sin su contenido).
 */
function readResponse(body: unknown): AiAnalysis {
  const record = (body ?? {}) as {
    content?: Block[];
    stop_reason?: unknown;
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  };
  const blocks = Array.isArray(record.content) ? record.content : [];
  const stopReason = typeof record.stop_reason === 'string' ? record.stop_reason : 'desconocido';

  const call =
    blocks.find((block) => block?.type === 'tool_use' && block.name === TOOL_NAME) ??
    blocks.find((block) => block?.type === 'tool_use');
  const text = blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n');

  let raw: unknown;
  let source: string;
  if (call) {
    raw = call.input;
    source = call.name === TOOL_NAME ? 'herramienta' : `herramienta ${String(call.name)}`;
  } else {
    raw = extractJsonValue(text);
    source = raw === undefined ? 'nada' : 'texto';
  }

  const diagnostics = `stop_reason=${stopReason}; bloques=[${blocks.map((b) => b?.type ?? '?').join(', ')}]; origen=${source}; forma=${describeShape(raw)}`;
  if (raw === undefined)
    throw new AiError('bad_response', `la respuesta no trae datos. ${diagnostics}`);

  const tokens = (value: unknown) =>
    typeof value === 'number' && value > 0 ? Math.round(value) : 0;
  return {
    raw,
    usage: {
      inputTokens: tokens(record.usage?.input_tokens),
      outputTokens: tokens(record.usage?.output_tokens),
    },
    diagnostics,
  };
}
