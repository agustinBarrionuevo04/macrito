import { parseModelItems } from './schema';
import { PHOTO_SYSTEM, TEXT_SYSTEM } from './prompts';
import { AiError, type AiProvider, type AiTool, type AiUsage } from './types';
import type { UsageKind, UsageTracker } from './usage';

/** Se alcanzó el límite diario de este tipo de análisis. */
export class QuotaExceededError extends Error {
  constructor(
    readonly kind: UsageKind,
    readonly limit: number,
  ) {
    super(`límite diario de ${kind} alcanzado (${limit})`);
    this.name = 'QuotaExceededError';
  }
}

export type AiServiceDeps = {
  provider: AiProvider;
  usage: UsageTracker;
  limits: { photo: number; text: number };
  /** Registro de la respuesta cruda del modelo (solo con `AI_DEBUG=1`). */
  debug?: (message: string) => void;
};

/**
 * Orquesta un análisis: reserva cupo, llama al proveedor, valida la respuesta y registra tokens.
 * El cupo solo se consume si el pedido llegó a procesarse: si el proveedor falló antes de
 * devolver algo, se libera (no se le cobra al usuario un error nuestro).
 */
export function createAiService({ provider, usage, limits, debug }: AiServiceDeps) {
  async function run<T>(
    userId: string,
    day: string,
    kind: UsageKind,
    call: () => ReturnType<AiProvider['analyze']>,
    parse: (raw: unknown) => T,
  ): Promise<T> {
    if (!(await usage.reserve(userId, day, kind, limits[kind]))) {
      throw new QuotaExceededError(kind, limits[kind]);
    }

    let analysis;
    try {
      analysis = await call();
    } catch (error) {
      await usage.release(userId, day, kind);
      throw error;
    }

    const used: AiUsage = analysis.usage;
    // Los tokens se registran aunque la respuesta no sirva: se gastaron igual.
    await usage.recordTokens(userId, day, kind, used);
    try {
      return parse(analysis.raw);
    } catch (error) {
      if (error instanceof AiError && analysis.diagnostics) {
        debug?.(`respuesta cruda del modelo: ${JSON.stringify(analysis.raw).slice(0, 800)}`);
        throw new AiError(error.code, `${error.message}. ${analysis.diagnostics}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  return {
    analyzePhoto: (userId: string, day: string, jpeg: Uint8Array, signal?: AbortSignal) =>
      run(
        userId,
        day,
        'photo',
        () =>
          provider.analyze(
            {
              kind: 'photo',
              mediaType: 'image/jpeg',
              base64: Buffer.from(jpeg).toString('base64'),
            },
            PHOTO_SYSTEM,
            signal,
          ),
        parseModelItems,
      ),

    analyzeText: (userId: string, day: string, text: string, signal?: AbortSignal) =>
      run(
        userId,
        day,
        'text',
        () => provider.analyze({ kind: 'text', text }, TEXT_SYSTEM, signal),
        parseModelItems,
      ),

    /**
     * Pedido de texto con su propia herramienta y validación (lo usa el asistente de plan). Cuenta
     * contra el mismo cupo diario de texto: no hay un presupuesto aparte que se pueda disparar.
     */
    structured: <T>(
      userId: string,
      day: string,
      request: { text: string; system: string; tool: AiTool; parse: (raw: unknown) => T },
      signal?: AbortSignal,
    ) =>
      run(
        userId,
        day,
        'text',
        () =>
          provider.analyze(
            { kind: 'text', text: request.text },
            request.system,
            signal,
            request.tool,
          ),
        request.parse,
      ),
  };
}

export type AiService = ReturnType<typeof createAiService>;

export { AiError };
