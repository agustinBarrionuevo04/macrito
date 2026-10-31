/**
 * Referencias diarias de fibra, azúcares y sodio. Son orientativas (no consejo médico) y salen de
 * recomendaciones públicas; cada una se explica en la pantalla:
 * - Fibra: 14 g por cada 1.000 kcal (ingesta adecuada del Instituto de Medicina de EE.UU., 2005).
 * - Sodio: menos de 2.000 mg (OMS; equivale a 5 g de sal, que es lo que recomienda el Ministerio de Salud de la Nación).
 * - Azúcares: la OMS recomienda que los azúcares *libres* sean menos del 10 % de las calorías. Las etiquetas informan
 *   azúcares totales (incluyen los naturales de frutas y lácteos), así que como tope es más estricto y solo orientativo.
 */
export const FIBER_G_PER_1000_KCAL = 14;
export const SODIUM_LIMIT_MG = 2000;
export const SUGAR_MAX_KCAL_FRACTION = 0.1;
export const KCAL_PER_G_SUGAR = 4;

export type MicroKind = 'goal' | 'limit';
export type MicroReference = { kind: MicroKind; value: number };

export type MicroReferences = {
  fiber: MicroReference;
  sugar: MicroReference;
  sodium: MicroReference;
};

/** Referencias para una meta de calorías: la fibra se busca llegar, el azúcar y el sodio son topes. */
export function microReferences(targetKcal: number): MicroReferences {
  const kcal = Number.isFinite(targetKcal) && targetKcal > 0 ? targetKcal : 0;
  return {
    fiber: { kind: 'goal', value: Math.round((kcal / 1000) * FIBER_G_PER_1000_KCAL) },
    sugar: {
      kind: 'limit',
      value: Math.round((kcal * SUGAR_MAX_KCAL_FRACTION) / KCAL_PER_G_SUGAR),
    },
    sodium: { kind: 'limit', value: SODIUM_LIMIT_MG },
  };
}

export type MicroTotals = {
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  /** Entradas del día. */
  entries: number;
  /** Entradas cuyo alimento informa al menos uno de los tres datos. */
  withData: number;
};

/** Estado de una barra: llegó a la meta (fibra), superó el tope (azúcar, sodio) o va en camino. */
export type MicroStatus = 'reached' | 'over' | 'below';

export function microStatus(value: number, reference: MicroReference): MicroStatus {
  if (reference.kind === 'goal') return value >= reference.value ? 'reached' : 'below';
  return value > reference.value ? 'over' : 'below';
}

/** Cuán completo es el dato: `none` sin entradas, `complete` si todas aportaron, si no `partial`. */
export function microCoverage(
  totals: Pick<MicroTotals, 'entries' | 'withData'>,
): 'none' | 'partial' | 'complete' {
  if (totals.entries === 0) return 'none';
  return totals.withData >= totals.entries ? 'complete' : 'partial';
}
