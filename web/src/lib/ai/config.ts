import { createAnthropicProvider } from './anthropic';
import { AiError, type AiProvider } from './types';

/** Modelo por defecto del proveedor Anthropic; se cambia con `AI_MODEL`. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_DAILY_PHOTO_LIMIT = 20;
export const DEFAULT_DAILY_TEXT_LIMIT = 100;

/** Variables de entorno que lee la IA (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_DAILY_PHOTO_LIMIT`, `AI_DAILY_TEXT_LIMIT`). */
export type AiEnv = Readonly<Record<string, string | undefined>>;

/** Entero ≥ 0 de una variable de entorno; si falta o no es válida, el valor por defecto. */
export function limitFrom(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function limitsFrom(env: AiEnv): { photo: number; text: number } {
  return {
    photo: limitFrom(env.AI_DAILY_PHOTO_LIMIT, DEFAULT_DAILY_PHOTO_LIMIT),
    text: limitFrom(env.AI_DAILY_TEXT_LIMIT, DEFAULT_DAILY_TEXT_LIMIT),
  };
}

/** Arma el proveedor configurado. Falla con `not_configured` si falta la clave o el proveedor no existe. */
export function createProviderFromEnv(env: AiEnv): AiProvider {
  const name = (env.AI_PROVIDER?.trim() || 'anthropic').toLowerCase();
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) throw new AiError('not_configured', 'falta AI_API_KEY');

  switch (name) {
    case 'anthropic':
      return createAnthropicProvider({
        apiKey,
        model: env.AI_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
        ...(env.AI_BASE_URL?.trim() ? { baseUrl: env.AI_BASE_URL.trim() } : {}),
      });
    default:
      throw new AiError('not_configured', `proveedor desconocido: ${name}`);
  }
}
