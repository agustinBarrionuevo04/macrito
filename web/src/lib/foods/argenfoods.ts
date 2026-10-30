import type { Nutrients } from '@/types';
import { isPlausible, round2, toNumber } from './nutrition-check.ts';
import type { CatalogFood } from './types';

/**
 * Lectura de la tabla ARGENFOODS (Universidad Nacional de Luján, https://www.argenfood.unlu.edu.ar/).
 * Sus condiciones de uso autorizan el uso sin fines comerciales citando a los titulares; por eso
 * los datos NO se guardan en el repo: se descargan y se cargan a la base con
 * `scripts/load-argenfoods.mjs`. Este módulo solo sabe interpretar las páginas.
 *
 * Este archivo se ejecuta también con Node directo (sin bundler): los imports relativos llevan
 * extensión y los de tipos usan `import type`.
 */

export const ARGENFOODS_BASE_URL = 'https://www.argenfood.unlu.edu.ar/Tablas';
const KJ_PER_KCAL = 4.184;

/** Desvío máximo entre las kcal publicadas y las calculadas con factores Atwater (4/4/9). */
const ATWATER_TOLERANCE = 0.15;
const ATWATER_MIN_DIFF_KCAL = 20;

/**
 * Para completar un valor en blanco se exige mucho más que para marcar un error: la energía de la
 * tabla se calcula con factores fijos, y medida sobre las páginas reales coincide a ±2 kcal en
 * 146 de 149 casos con valores en blanco.
 */
const INFERENCE_TOLERANCE_KCAL = 3;

export type ArgenfoodsParsed = {
  code: number;
  name: string;
  /** Valores por 100 g de porción comestible; `null` si la celda está vacía. */
  values: Record<string, number | null>;
};

export type SkipReason =
  'missing_energy' | 'missing_protein' | 'missing_fat' | 'missing_carbs' | 'implausible_values';

/** Algo para revisar a mano: el alimento no se carga a menos que se pida. */
export type ArgenfoodsFlag = 'kcal_mismatch';

/** Cómo se obtuvo un valor que la página no trae directo. Informativo: sí se carga. */
export type ArgenfoodsNote =
  | 'carbs_total_only'
  | 'energy_computed'
  | 'protein_inferred_zero'
  | 'fat_inferred_zero'
  | 'carbs_inferred_zero';

export type ArgenfoodsResult =
  | { status: 'ok'; food: CatalogFood; flags: ArgenfoodsFlag[]; notes: ArgenfoodsNote[] }
  | { status: 'skipped'; reason: SkipReason; code: number; name: string };

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  uuml: 'ü',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => ENTITIES[name] ?? match);
}

function clean(value: string): string {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

/** Las páginas están en windows-1252. */
export function decodeArgenfoodsHtml(bytes: Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes);
}

function labelKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Códigos de alimento que lista una página del índice alfabético, sin repetidos. */
export function parseIndexPage(html: string): number[] {
  const codes = new Set<number>();
  for (const match of html.matchAll(/href="\.\.\/Codigo\/(\d+)\.htm"/gi)) {
    codes.add(Number(match[1]));
  }
  return [...codes];
}

/** Letras de las páginas del índice alfabético (`A.htm`, `B.htm`…) que enlaza el índice general. */
export function parseIndexLetters(html: string): string[] {
  const letters = new Set<string>();
  for (const match of html.matchAll(/href="([A-Z])\.htm(?:#[A-Z])?"/g)) {
    if (match[1]) letters.add(match[1]);
  }
  return [...letters];
}

const ROW =
  /<p class="C1">([^<]*)<\/p><\/td><td[^>]*><p class="C2">([^<]*)<\/p><\/td><td[^>]*><p class="C3">([^<]*)<\/p>/gi;

/** Interpreta la página de un alimento (`Codigo/<n>.htm`). Devuelve `null` si no tiene el formato esperado. */
export function parseFoodPage(html: string, code: number): ArgenfoodsParsed | null {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  const name = title ? clean(title) : '';
  if (name === '') return null;

  const values: Record<string, number | null> = {};
  for (const row of html.matchAll(ROW)) {
    const label = labelKey(clean(row[1] ?? ''));
    const unit = clean(row[3] ?? '').toLowerCase();
    if (label === '') continue;
    // "Energía" aparece dos veces (kJ y kcal): se distingue por la unidad.
    const key = label === 'energia' ? `energia ${unit}` : label;
    values[key] = toNumber(clean(row[2] ?? '')) ?? null;
  }
  if (Object.keys(values).length === 0) return null;
  return { code, name, values };
}

/** ¿Las kcal publicadas concuerdan con las calculadas con factores Atwater (4/4/9)? */
function agrees(kcal: number, atwater: number): boolean {
  const diff = Math.abs(kcal - atwater);
  return diff <= ATWATER_MIN_DIFF_KCAL || diff <= ATWATER_TOLERANCE * Math.max(kcal, atwater);
}

/**
 * Convierte lo leído al formato del catálogo.
 *
 * La tabla deja en blanco lo que no analizó, y ese blanco NO se toma como 0 sin más. Solo se
 * completa un valor en dos casos, ambos verificables con los datos de la propia página:
 * - Falta la energía pero están los tres macros: se calcula con los factores 4/4/9 que la tabla
 *   documenta en su anexo ("Factores de conversión para el cálculo de los valores de energía").
 * - Faltan uno o más macros y la energía publicada queda explicada solo con los presentes, a ±3 kcal
 *   (carnes y pescados sin carbohidratos; verduras sin grasa; aceites sin proteína ni
 *   carbohidratos): la energía ya implica que lo ausente es ~0.
 * Todo lo demás con datos faltantes se omite y queda en el reporte.
 */
export function toArgenfoodsFood(parsed: ArgenfoodsParsed): ArgenfoodsResult {
  const { code, name, values } = parsed;
  const skip = (reason: SkipReason): ArgenfoodsResult => ({
    status: 'skipped',
    reason,
    code,
    name,
  });

  const kcalDirect = values['energia kcal'];
  const kj = values['energia kj'];
  let kcal: number | null = kcalDirect ?? (kj == null ? null : kj / KJ_PER_KCAL);
  let protein: number | null = values['proteinas'] ?? null;
  let fat: number | null = values['grasa total'] ?? null;
  const fiber = values['fibra dietetica'];
  const carbsAvailable = values['carbohidratos disponibles'];
  const carbsTotal = values['carbohidratos totales'];

  const flags: ArgenfoodsFlag[] = [];
  const notes: ArgenfoodsNote[] = [];

  let carbs: number | null = carbsAvailable ?? null;
  if (carbs === null && carbsTotal != null && fiber != null)
    carbs = Math.max(0, carbsTotal - fiber);
  if (carbs === null && carbsTotal != null) {
    carbs = carbsTotal;
    notes.push('carbs_total_only');
  }

  // Energía ausente con los tres macros presentes: se calcula como lo hace la tabla.
  if (kcal === null && protein !== null && fat !== null && carbs !== null) {
    kcal = 4 * protein + 4 * carbs + 9 * fat;
    notes.push('energy_computed');
  }

  if (kcal === null) return skip('missing_energy');

  // Macros en blanco: si la energía publicada ya queda explicada solo con los macros presentes
  // (±3 kcal), los que faltan aportan ~0 (carnes y aceites sin carbohidratos, verduras sin grasa).
  const atwaterPresent = 4 * (protein ?? 0) + 9 * (fat ?? 0) + 4 * (carbs ?? 0);
  if (
    (protein === null || fat === null || carbs === null) &&
    Math.abs(kcal - atwaterPresent) <= INFERENCE_TOLERANCE_KCAL
  ) {
    if (protein === null) {
      protein = 0;
      notes.push('protein_inferred_zero');
    }
    if (fat === null) {
      fat = 0;
      notes.push('fat_inferred_zero');
    }
    if (carbs === null) {
      carbs = 0;
      notes.push('carbs_inferred_zero');
    }
  }

  if (protein === null) return skip('missing_protein');
  if (fat === null) return skip('missing_fat');
  if (carbs === null) return skip('missing_carbs');

  const per100g: Nutrients = {
    kcal: round2(kcal),
    protein_g: round2(protein),
    carbs_g: round2(carbs),
    fat_g: round2(fat),
  };
  if (!isPlausible(per100g)) return skip('implausible_values');

  if (fiber != null && fiber >= 0) per100g.fiber_g = round2(fiber);
  const sodium = values['sodio'];
  if (sodium != null && sodium >= 0) per100g.sodium_mg = round2(sodium);

  const atwater = 4 * per100g.protein_g + 4 * per100g.carbs_g + 9 * per100g.fat_g;
  if (!agrees(per100g.kcal, atwater)) flags.push('kcal_mismatch');

  return {
    status: 'ok',
    flags,
    notes,
    food: {
      id: '',
      source: 'ar_seed',
      sourceId: String(code),
      name: name.slice(0, 200),
      per100g,
      portions: [],
    },
  };
}
