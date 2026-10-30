import type { Nutrients } from '@/types';
import { isPlausible, round2, toNumber } from './nutrition-check';
import type { CatalogFood } from './types';

/** Solo alimentos genéricos: los "Branded" de USDA son productos de EE.UU. y los cubre OFF. */
const GENERIC_DATA_TYPES = new Set(['Foundation', 'SR Legacy']);

const KJ_PER_KCAL = 4.184;

// Números de nutriente de FoodData Central.
const N = {
  energyKcal: '208',
  energyKj: '268',
  /** Energía por factores Atwater (los alimentos Foundation a veces no traen 208). */
  atwaterGeneral: '957',
  atwaterSpecific: '958',
  protein: '203',
  fat: '204',
  carbs: '205',
  fiber: '291',
  sugars: '269',
  sodium: '307',
} as const;

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Valores por 100 g indexados por número de nutriente. */
function indexNutrients(items: unknown): Map<string, number> {
  const byNumber = new Map<string, number>();
  if (!Array.isArray(items)) return byNumber;
  for (const item of items) {
    if (!isRecord(item)) continue;
    const key = item.nutrientNumber == null ? undefined : String(item.nutrientNumber);
    const value = toNumber(item.value ?? item.amount);
    if (key !== undefined && value !== undefined && !byNumber.has(key)) byNumber.set(key, value);
  }
  return byNumber;
}

/** Normaliza un alimento de `foods/search` de USDA FoodData Central. */
export function normalizeUsdaFood(raw: unknown): CatalogFood | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.dataType !== 'string' || !GENERIC_DATA_TYPES.has(raw.dataType)) return null;

  const fdcId = toNumber(raw.fdcId);
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (fdcId === undefined || !Number.isInteger(fdcId) || description === '') return null;

  const nutrients = indexNutrients(raw.foodNutrients);
  const kj = nutrients.get(N.energyKj);
  const kcal =
    nutrients.get(N.energyKcal) ??
    nutrients.get(N.atwaterSpecific) ??
    nutrients.get(N.atwaterGeneral) ??
    (kj === undefined ? undefined : kj / KJ_PER_KCAL);
  const protein = nutrients.get(N.protein);
  const fat = nutrients.get(N.fat);
  const carbs = nutrients.get(N.carbs);
  if (kcal === undefined || protein === undefined || fat === undefined || carbs === undefined) {
    return null;
  }

  const per100g: Nutrients = {
    kcal: round2(kcal),
    protein_g: round2(protein),
    carbs_g: round2(carbs),
    fat_g: round2(fat),
  };
  if (!isPlausible(per100g)) return null;

  const fiber = nutrients.get(N.fiber);
  const sugar = nutrients.get(N.sugars);
  const sodium = nutrients.get(N.sodium);
  if (fiber !== undefined && fiber >= 0) per100g.fiber_g = round2(fiber);
  if (sugar !== undefined && sugar >= 0) per100g.sugar_g = round2(sugar);
  if (sodium !== undefined && sodium >= 0) per100g.sodium_mg = round2(sodium);

  return {
    id: '',
    source: 'usda',
    sourceId: String(fdcId),
    name: description.slice(0, 200),
    per100g,
    portions: [],
  };
}
