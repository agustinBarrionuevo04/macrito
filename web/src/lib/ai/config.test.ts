import { describe, expect, it } from 'vitest';
import { createProviderFromEnv, limitFrom, limitsFrom } from './config';
import { AiError } from './types';

describe('limitFrom', () => {
  it('usa el valor si es un entero ≥ 0, y el de respaldo si no', () => {
    expect(limitFrom('5', 20)).toBe(5);
    expect(limitFrom('0', 20)).toBe(0);
    for (const bad of [undefined, '', '  ', '-1', '2.5', 'diez', 'NaN']) {
      expect(limitFrom(bad, 20), String(bad)).toBe(20);
    }
  });
});

describe('limitsFrom', () => {
  it('foto 20 y texto 100 por defecto', () => {
    expect(limitsFrom({})).toEqual({ photo: 20, text: 100 });
    expect(limitsFrom({ AI_DAILY_PHOTO_LIMIT: '3', AI_DAILY_TEXT_LIMIT: '7' })).toEqual({
      photo: 3,
      text: 7,
    });
  });
});

describe('createProviderFromEnv', () => {
  const codeOf = (env: Parameters<typeof createProviderFromEnv>[0]) => {
    try {
      createProviderFromEnv(env);
    } catch (error) {
      return error instanceof AiError ? error.code : 'other';
    }
    return null;
  };

  it('sin clave no está configurado', () => {
    expect(codeOf({})).toBe('not_configured');
    expect(codeOf({ AI_API_KEY: '   ' })).toBe('not_configured');
  });

  it('un proveedor desconocido no está configurado', () => {
    expect(codeOf({ AI_PROVIDER: 'otro', AI_API_KEY: 'k' })).toBe('not_configured');
  });

  it('anthropic es el proveedor por defecto', () => {
    expect(codeOf({ AI_API_KEY: 'k' })).toBeNull();
    expect(codeOf({ AI_PROVIDER: 'Anthropic', AI_API_KEY: 'k', AI_MODEL: 'x' })).toBeNull();
  });

  it('gemini necesita clave y acepta modelo propio', () => {
    expect(codeOf({ AI_PROVIDER: 'gemini' })).toBe('not_configured');
    expect(codeOf({ AI_PROVIDER: 'Gemini', AI_API_KEY: 'k' })).toBeNull();
    expect(codeOf({ AI_PROVIDER: 'gemini', AI_API_KEY: 'k', AI_MODEL: 'x' })).toBeNull();
  });
});
