import { describeShape, extractJsonValue } from './extract';
import { TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA } from './schema';
import { AiError, type AiAnalysis, type AiContent, type AiProvider } from './types';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_TIMEOUT_MS = 25_000;
// Los modelos con razonamiento descuentan lo que piensan de este tope, así que se deja holgado.
const MAX_OUTPUT_TOKENS = 4096;

export type GeminiOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Para tests. */
  fetch?: typeof fetch;
};

/** Gemini acepta solo un subconjunto de OpenAPI: se quitan las palabras que rechaza. */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema === null || typeof schema !== 'object') return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => key !== 'additionalProperties')
      .map(([key, value]) => [key, toGeminiSchema(value)]),
  );
}

function requestBody(content: AiContent, system: string) {
  const parts =
    content.kind === 'photo'
      ? [
          { inlineData: { mimeType: content.mediaType, data: content.base64 } },
          { text: 'Listá los alimentos de esta foto.' },
        ]
      : [{ text: content.text }];

  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    tools: [
      {
        functionDeclarations: [
          {
            name: TOOL_NAME,
            description: TOOL_DESCRIPTION,
            parameters: toGeminiSchema(TOOL_SCHEMA),
          },
        ],
      },
    ],
    // Fuerza la llamada a la función: la salida es siempre estructurada.
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [TOOL_NAME] } },
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  };
}

/** Mensaje de error que devuelve la API (`{ error: { status, message } }`). No incluye datos del usuario ni la clave. */
async function apiErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const error = (body as { error?: { status?: unknown; message?: unknown } } | null)?.error;
    const status = typeof error?.status === 'string' ? error.status : '';
    const message = typeof error?.message === 'string' ? error.message : '';
    return [status, message].filter(Boolean).join(': ').slice(0, 300);
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
    // Gemini contesta 400 también a una clave inválida o a una región sin acceso: no es culpa del pedido.
    if (/api key/i.test(detail)) return new AiError('unauthorized', message);
    if (/FAILED_PRECONDITION/.test(detail)) return new AiError('unavailable', message);
    return content.kind === 'photo'
      ? new AiError('image_rejected', message)
      : new AiError('bad_response', message);
  }
  return new AiError('unavailable', message);
}

/** Proveedor Gemini (`generateContent`) con salida forzada por llamada a función. */
export function createGeminiProvider(options: GeminiOptions): AiProvider {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;

  return {
    async analyze(content, system, signal): Promise<AiAnalysis> {
      const timeout = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify(requestBody(content, system)),
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

type Part = { text?: unknown; functionCall?: { name?: unknown; args?: unknown } };

/**
 * Saca de la respuesta lo que devolvió el modelo. Lo normal es la llamada a la función; si
 * contestó con texto se busca el JSON ahí. La forma de lo recibido se guarda en `diagnostics`.
 */
function readResponse(body: unknown): AiAnalysis {
  const record = (body ?? {}) as {
    candidates?: { content?: { parts?: Part[] }; finishReason?: unknown }[];
    promptFeedback?: { blockReason?: unknown };
    usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown };
  };
  const candidate = Array.isArray(record.candidates) ? record.candidates[0] : undefined;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const finish =
    typeof candidate?.finishReason === 'string' ? candidate.finishReason : 'desconocido';
  const blocked =
    typeof record.promptFeedback?.blockReason === 'string'
      ? `; bloqueado=${record.promptFeedback.blockReason}`
      : '';

  const call =
    parts.find((part) => part?.functionCall?.name === TOOL_NAME) ??
    parts.find((part) => part?.functionCall);
  const text = parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text as string)
    .join('\n');

  let raw: unknown;
  let source: string;
  if (call?.functionCall) {
    raw = call.functionCall.args;
    source =
      call.functionCall.name === TOOL_NAME
        ? 'herramienta'
        : `herramienta ${String(call.functionCall.name)}`;
  } else {
    raw = extractJsonValue(text);
    source = raw === undefined ? 'nada' : 'texto';
  }

  const diagnostics = `finishReason=${finish}${blocked}; partes=[${parts.map((p) => (p?.functionCall ? 'functionCall' : 'text' in (p ?? {}) ? 'text' : '?')).join(', ')}]; origen=${source}; forma=${describeShape(raw)}`;
  if (raw === undefined)
    throw new AiError('bad_response', `la respuesta no trae datos. ${diagnostics}`);

  const tokens = (value: unknown) =>
    typeof value === 'number' && value > 0 ? Math.round(value) : 0;
  return {
    raw,
    usage: {
      inputTokens: tokens(record.usageMetadata?.promptTokenCount),
      outputTokens: tokens(record.usageMetadata?.candidatesTokenCount),
    },
    diagnostics,
  };
}
