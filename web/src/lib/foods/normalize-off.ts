import type { Nutrients, Portion } from '@/types';
import { isPlausible, round2, toNumber } from './nutrition-check';
import type { CatalogFood } from './types';

const KJ_PER_KCAL = 4.184;
const MAX_NAME_LENGTH = 200;
const MAX_PORTION_G = 2000;

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Nombre en español si existe; si no, el genérico, y recién después inglés/francés. */
function pickName(p: Raw): string | undefined {
  return (
    text(p.product_name_es) ??
    text(p.product_name) ??
    text(p.product_name_en) ??
    text(p.product_name_fr)
  );
}

function pickEnergyKcal(n: Raw): number | undefined {
  const kcal = toNumber(n['energy-kcal_100g']);
  if (kcal !== undefined) return kcal;
  const kj = toNumber(n['energy-kj_100g']) ?? toNumber(n['energy_100g']);
  return kj === undefined ? undefined : kj / KJ_PER_KCAL;
}

function pickSodiumMg(n: Raw): number | undefined {
  const sodiumG = toNumber(n['sodium_100g']);
  if (sodiumG !== undefined) return sodiumG * 1000;
  const saltG = toNumber(n['salt_100g']);
  // sal = sodio × 2.5
  return saltG === undefined ? undefined : (saltG / 2.5) * 1000;
}

function pickPortions(p: Raw): Portion[] {
  const grams = toNumber(p.serving_quantity);
  if (grams === undefined || grams <= 0 || grams > MAX_PORTION_G) return [];
  return [{ label: text(p.serving_size) ?? '1 porción', grams: round2(grams) }];
}

function optional(value: number | undefined): number | undefined {
  return value === undefined || value < 0 ? undefined : round2(value);
}

/**
 * Normaliza un producto de Open Food Facts (Search-a-licious, `cgi/search.pl` o API v2).
 * Devuelve `null` si no tiene código, nombre, kcal y macros, o si los valores son imposibles.
 */
export function normalizeOffProduct(raw: unknown): CatalogFood | null {
  if (!isRecord(raw)) return null;

  const code = text(raw.code);
  const name = pickName(raw);
  const nutriments = raw.nutriments;
  if (!code || !/^\d{4,14}$/.test(code) || !name || !isRecord(nutriments)) return null;

  const kcal = pickEnergyKcal(nutriments);
  const protein = toNumber(nutriments.proteins_100g);
  const carbs = toNumber(nutriments.carbohydrates_100g);
  const fat = toNumber(nutriments.fat_100g);
  if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) {
    return null;
  }

  const per100g: Nutrients = {
    kcal: round2(kcal),
    protein_g: round2(protein),
    carbs_g: round2(carbs),
    fat_g: round2(fat),
  };
  if (!isPlausible(per100g)) return null;

  const fiber = optional(toNumber(nutriments.fiber_100g));
  const sugar = optional(toNumber(nutriments.sugars_100g));
  const sodium = optional(pickSodiumMg(nutriments));
  if (fiber !== undefined) per100g.fiber_g = fiber;
  if (sugar !== undefined) per100g.sugar_g = sugar;
  if (sodium !== undefined) per100g.sodium_mg = sodium;

  const brand = text(raw.brands)?.split(',')[0]?.trim();
  const countries = Array.isArray(raw.countries_tags) ? raw.countries_tags : [];
  const popularity = toNumber(raw.popularity_key);

  const food: CatalogFood = {
    id: '',
    source: 'off',
    sourceId: code,
    name: name.slice(0, MAX_NAME_LENGTH),
    barcode: code,
    per100g,
    portions: pickPortions(raw),
    argentina: countries.includes('en:argentina'),
  };
  if (brand) food.brand = brand;
  if (popularity !== undefined) food.popularity = popularity;
  return food;
}
