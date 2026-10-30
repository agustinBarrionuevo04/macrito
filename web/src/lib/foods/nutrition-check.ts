import type { Nutrients } from '@/types';

/** Convierte a número finito; acepta strings numéricos (OFF los mezcla). */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Redondea a 2 decimales para no guardar ruido de punto flotante (4.699999 → 4.7). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Descarta datos imposibles de la fuente: kcal por 100 g entre 0 y 900 (la grasa pura tiene ~900),
 * cada macro entre 0 y 100 g y suma de macros ≤ 105 g (margen para redondeos de etiqueta).
 */
export function isPlausible(n: Nutrients): boolean {
  const { kcal, protein_g, carbs_g, fat_g } = n;
  if (kcal < 0 || kcal > 900) return false;
  for (const grams of [protein_g, carbs_g, fat_g]) {
    if (grams < 0 || grams > 100) return false;
  }
  return protein_g + carbs_g + fat_g <= 105;
}
