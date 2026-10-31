import type { Confidence, PhotoItem } from '@/types';
import { isPlausible, toNumber } from '@/lib/foods/nutrition-check';
import { extractJsonValue } from './extract';
import { AiError, type AiTool } from './types';
import { AI_UNITS, isAiUnit, toGrams } from './units';

export const TOOL_NAME = 'log_meal_items';
export const TOOL_DESCRIPTION = 'Registrar los alimentos que se identificaron.';

/** Gramos máximos de un solo ítem. Más que esto casi seguro es un error de unidad (×1000). */
export const MAX_ITEM_GRAMS = 3000;
export const MAX_ITEMS = 15;
export const MAX_COUNT = 50;
const MAX_QUERY_LENGTH = 80;

/**
 * Esquema de la herramienta (JSON Schema). Es una pista para el modelo, no una garantía:
 * `parseModelItems` valida todo de nuevo, aunque el modelo ignore el esquema.
 */
export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Nombre del alimento en español rioplatense, sin cantidades.',
          },
          est_grams: {
            type: 'number',
            description:
              'Gramos estimados del total de este alimento. Omitir si no se puede estimar.',
          },
          count: {
            type: 'integer',
            description: 'Cantidad de unidades visibles o mencionadas (2 milanesas, 3 empanadas).',
          },
          amount: { type: 'number', description: 'Solo texto: cantidad que escribió la persona.' },
          unit: {
            type: 'string',
            enum: [...AI_UNITS],
            description: 'Solo texto: unidad que escribió la persona, solo si es una de estas.',
          },
          confidence: { type: 'string', enum: ['low', 'med', 'high'] },
          per100g_guess: {
            type: 'object',
            description: 'Valores típicos por 100 g de este alimento, por si no está en la base.',
            properties: {
              kcal: { type: 'number' },
              protein_g: { type: 'number' },
              carbs_g: { type: 'number' },
              fat_g: { type: 'number' },
            },
            required: ['kcal', 'protein_g', 'carbs_g', 'fat_g'],
          },
        },
        required: ['query', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/** Herramienta por defecto de los proveedores: identificar los alimentos de una foto o un texto. */
export const MEAL_TOOL: AiTool = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  schema: TOOL_SCHEMA,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const positive = (value: unknown): number | undefined => {
  const n = toNumber(value);
  return n !== undefined && n > 0 ? n : undefined;
};

function parseGuess(value: unknown): PhotoItem['per100g_guess'] {
  if (!isRecord(value)) return undefined;
  const kcal = toNumber(value.kcal);
  const protein_g = toNumber(value.protein_g);
  const carbs_g = toNumber(value.carbs_g);
  const fat_g = toNumber(value.fat_g);
  if (
    kcal === undefined ||
    protein_g === undefined ||
    carbs_g === undefined ||
    fat_g === undefined
  ) {
    return undefined;
  }
  const guess = { kcal, protein_g, carbs_g, fat_g };
  if (!isPlausible(guess)) return undefined;
  // Las kcal tienen que cerrar con los macros (Atwater 4/4/9), con margen para fibra y alcohol.
  const fromMacros = 4 * protein_g + 4 * carbs_g + 9 * fat_g;
  return Math.abs(kcal - fromMacros) <= Math.max(40, 0.3 * Math.max(kcal, fromMacros))
    ? guess
    : undefined;
}

/** Nombres con los que un modelo suele decir "gramos" o "nombre del alimento" cuando ignora el esquema. */
const QUERY_KEYS = ['query', 'name', 'nombre', 'food', 'alimento', 'item'] as const;
const GRAMS_KEYS = ['est_grams', 'grams', 'gramos', 'estimated_grams', 'weight_g'] as const;
/** Nombres con los que un modelo suele llamar a la lista de ítems. */
const ITEMS_KEYS = ['items', 'foods', 'food_items', 'alimentos', 'comidas', 'results'] as const;

const firstOf = (raw: Record<string, unknown>, keys: readonly string[]): unknown =>
  keys.map((key) => raw[key]).find((value) => value !== undefined && value !== null);

function parseGrams(raw: Record<string, unknown>): number | null {
  const amount = positive(raw.amount);
  const grams =
    amount !== undefined && isAiUnit(raw.unit)
      ? toGrams(amount, raw.unit)
      : positive(firstOf(raw, GRAMS_KEYS));
  return grams !== undefined && grams <= MAX_ITEM_GRAMS ? Math.round(grams * 100) / 100 : null;
}

function parseItem(raw: unknown): PhotoItem | null {
  if (!isRecord(raw)) return null;
  const rawQuery = firstOf(raw, QUERY_KEYS);
  if (typeof rawQuery !== 'string') return null;
  const query = rawQuery.trim().replace(/\s+/g, ' ');
  if (query.length === 0 || query.length > MAX_QUERY_LENGTH) return null;

  const item: PhotoItem = {
    query,
    est_grams: parseGrams(raw),
    confidence: (['low', 'med', 'high'] as const).includes(raw.confidence as Confidence)
      ? (raw.confidence as Confidence)
      : 'low',
  };
  const count = toNumber(raw.count);
  if (count !== undefined && Number.isInteger(count) && count >= 1 && count <= MAX_COUNT) {
    item.count = count;
  }
  const guess = parseGuess(raw.per100g_guess);
  if (guess) item.per100g_guess = guess;
  return item;
}

/**
 * Lleva la respuesta a `{ items: [...] }` cuando el modelo la devolvió de otra forma pero la
 * información está: como texto JSON (con o sin cercas), como una lista suelta, con otro nombre para
 * la lista, o anidada un nivel. Si no se puede, devuelve el valor tal cual y la validación falla.
 */
export function coerceItemsRoot(raw: unknown, depth = 0): unknown {
  let value = raw;
  if (typeof value === 'string') value = extractJsonValue(value) ?? value;
  if (Array.isArray(value)) return { items: value };
  if (!isRecord(value)) return value;
  if (Array.isArray(value.items)) return value;

  for (const key of ITEMS_KEYS) {
    const candidate = value[key];
    if (typeof candidate === 'string') {
      const parsed = coerceItemsRoot(candidate, depth + 1);
      if (isRecord(parsed) && Array.isArray(parsed.items)) return parsed;
    }
    if (Array.isArray(candidate)) return { items: candidate };
  }

  const arrays = Object.values(value).filter(Array.isArray);
  if (arrays.length === 1) return { items: arrays[0] };

  if (depth < 1) {
    const nested = Object.values(value).filter(isRecord);
    if (nested.length === 1) {
      const inner = coerceItemsRoot(nested[0], depth + 1);
      if (isRecord(inner) && Array.isArray(inner.items)) return inner;
    }
  }
  return value;
}

/**
 * Valida la respuesta del modelo. Nada de lo que venga se confía: se descartan los ítems mal
 * formados, se normalizan las unidades y se ignora cualquier campo que no esté en el contrato.
 * Antes se intenta recuperar la lista si vino con otra forma (`coerceItemsRoot`). Falla si no hay
 * lista de ítems, o si había ítems y no sobrevivió ninguno (la respuesta no era la pedida). Una
 * lista vacía es válida: significa "no hay comida".
 */
export function parseModelItems(raw: unknown): PhotoItem[] {
  const root = coerceItemsRoot(raw);
  if (!isRecord(root) || !Array.isArray(root.items)) {
    throw new AiError('bad_response', 'la respuesta no trae la lista de ítems');
  }
  const items = root.items.flatMap((entry) => parseItem(entry) ?? []).slice(0, MAX_ITEMS);
  if (items.length === 0 && root.items.length > 0) {
    throw new AiError('bad_response', 'ningún ítem de la respuesta era válido');
  }
  return items;
}
