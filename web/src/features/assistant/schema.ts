import { MAX_ITEM_GRAMS } from '@/lib/ai/schema';
import { AiError, type AiTool } from '@/lib/ai/types';
import { toNumber } from '@/lib/foods/nutrition-check';
import type { MealType } from '@/types';
import type { RawPlanOption } from './types';

export const PLAN_TOOL_NAME = 'suggest_meals';
export const MAX_OPTIONS = 4;
export const MAX_ITEMS_PER_OPTION = 8;
const MAX_QUERY_LENGTH = 80;
const MAX_TITLE_LENGTH = 60;
const MEALS: readonly MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/**
 * Esquema de la herramienta. Es una pista para el modelo: `parsePlanOptions` valida todo de nuevo.
 * El modelo solo elige alimentos y gramos; no devuelve calorías ni macros (salen de la base).
 */
export const PLAN_TOOL: AiTool = {
  name: PLAN_TOOL_NAME,
  description: 'Proponer opciones concretas de comida.',
  schema: {
    type: 'object',
    properties: {
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Nombre corto de la opción, ej. "Milanesa con ensalada".',
            },
            meal: { type: 'string', enum: [...MEALS], description: 'A qué comida corresponde.' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Nombre simple del alimento, sin cantidades ni preparación.',
                  },
                  grams: { type: 'number', description: 'Gramos de este alimento en la porción.' },
                },
                required: ['query', 'grams'],
                additionalProperties: false,
              },
            },
          },
          required: ['title', 'meal', 'items'],
          additionalProperties: false,
        },
      },
    },
    required: ['options'],
    additionalProperties: false,
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const firstOf = (raw: Record<string, unknown>, keys: readonly string[]): unknown =>
  keys.map((key) => raw[key]).find((value) => value !== undefined && value !== null);

/** Nombres con los que un modelo suele llamar a cada campo cuando ignora el esquema. */
const OPTIONS_KEYS = [
  'options',
  'opciones',
  'meals',
  'suggestions',
  'sugerencias',
  'plan',
] as const;
const ITEMS_KEYS = ['items', 'foods', 'alimentos', 'ingredients', 'ingredientes'] as const;
const TITLE_KEYS = ['title', 'name', 'titulo', 'título', 'nombre'] as const;
const QUERY_KEYS = ['query', 'name', 'nombre', 'food', 'alimento'] as const;
const GRAMS_KEYS = ['grams', 'gramos', 'est_grams', 'g', 'weight_g'] as const;

function parseItem(raw: unknown) {
  if (!isRecord(raw)) return null;
  const rawQuery = firstOf(raw, QUERY_KEYS);
  if (typeof rawQuery !== 'string') return null;
  const query = rawQuery.trim().replace(/\s+/g, ' ');
  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) return null;
  const grams = toNumber(firstOf(raw, GRAMS_KEYS));
  if (grams === undefined || !(grams > 0) || grams > MAX_ITEM_GRAMS) return null;
  return { query, grams: Math.round(grams * 100) / 100 };
}

function parseOption(raw: unknown, index: number): RawPlanOption | null {
  if (!isRecord(raw)) return null;
  const rawItems = firstOf(raw, ITEMS_KEYS);
  if (!Array.isArray(rawItems)) return null;
  const items = rawItems.slice(0, MAX_ITEMS_PER_OPTION).flatMap((item) => {
    const parsed = parseItem(item);
    return parsed ? [parsed] : [];
  });
  // Una opción con un ítem ilegible no se arregla en silencio: sus totales quedarían subestimados.
  if (items.length === 0 || items.length < Math.min(rawItems.length, MAX_ITEMS_PER_OPTION)) {
    return null;
  }
  const rawTitle = firstOf(raw, TITLE_KEYS);
  const title =
    typeof rawTitle === 'string' && rawTitle.trim() !== ''
      ? rawTitle.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH)
      : `Opción ${index + 1}`;
  const meal = MEALS.find((m) => m === raw.meal) ?? null;
  return { title, meal, items };
}

/** Valida lo que devolvió el modelo. Lanza `bad_response` si no sobrevive ninguna opción. */
export function parsePlanOptions(raw: unknown): RawPlanOption[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? (firstOf(raw, OPTIONS_KEYS) as unknown)
      : undefined;
  if (!Array.isArray(list)) throw new AiError('bad_response', 'la respuesta no trae opciones');

  const options = list.slice(0, MAX_OPTIONS).flatMap((entry, index) => {
    const option = parseOption(entry, index);
    return option ? [option] : [];
  });
  if (options.length === 0) throw new AiError('bad_response', 'ninguna opción es válida');
  return options;
}
