import type { Nutrients } from '@/types';
import type { Snapshot } from './types';

/** 2 decimales: evita guardar ruido de punto flotante (0.1 + 0.2). */
export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Nutrición de `quantityG` gramos de un alimento con valores por 100 g. */
export function snapshotFromPer100g(per100g: Nutrients, quantityG: number): Snapshot {
  const factor = quantityG / 100;
  return {
    kcal: round2(per100g.kcal * factor),
    protein_g: round2(per100g.protein_g * factor),
    carbs_g: round2(per100g.carbs_g * factor),
    fat_g: round2(per100g.fat_g * factor),
  };
}

/**
 * Reescala una entrada a otra cantidad, proporcionalmente. Parte de la entrada y no del alimento:
 * así editar un alimento después no cambia el historial. Falla si la cantidad original es 0
 * (una entrada de calorías rápidas no tiene cantidad que reescalar).
 */
export function scaleSnapshot(
  snapshot: Snapshot,
  oldQuantityG: number,
  newQuantityG: number,
): Snapshot {
  if (!(oldQuantityG > 0)) throw new RangeError('La cantidad original debe ser mayor a 0');
  const factor = newQuantityG / oldQuantityG;
  return {
    kcal: round2(snapshot.kcal * factor),
    protein_g: round2(snapshot.protein_g * factor),
    carbs_g: round2(snapshot.carbs_g * factor),
    fat_g: round2(snapshot.fat_g * factor),
  };
}
