/** Lo que se le pide analizar al modelo. */
export type AiContent =
  { kind: 'text'; text: string } | { kind: 'photo'; mediaType: 'image/jpeg'; base64: string };

/** Herramienta que el modelo está obligado a llamar: su esquema fija la forma de la respuesta. */
export type AiTool = { name: string; description: string; schema: object };

export type AiUsage = { inputTokens: number; outputTokens: number };

export type AiAnalysis = {
  /** Lo que devolvió el modelo en la herramienta, sin validar. */
  raw: unknown;
  usage: AiUsage;
  /** Forma de lo que devolvió el proveedor (sin su contenido), para el registro de errores. */
  diagnostics?: string;
};

export type AiErrorCode =
  /** Falta la clave o el proveedor configurado no existe. */
  | 'not_configured'
  /** El proveedor rechazó nuestra clave (problema nuestro, no del usuario). */
  | 'unauthorized'
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  /** La respuesta no tenía lo pedido o no sobrevivió la validación. */
  | 'bad_response'
  /** El proveedor no pudo procesar la imagen. */
  | 'image_rejected';

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AiError';
  }
}

/**
 * Proveedor de modelo intercambiable. Agregar uno nuevo no toca el esquema ni los prompts: solo
 * cambia cómo se manda el pedido y cómo se lee la respuesta.
 */
export type AiProvider = {
  /** Sin `tool` se usa la de registrar comidas (`MEAL_TOOL`). */
  analyze(
    content: AiContent,
    system: string,
    signal?: AbortSignal,
    tool?: AiTool,
  ): Promise<AiAnalysis>;
};
