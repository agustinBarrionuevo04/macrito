/** Unidades que el modelo puede declarar cuando la persona escribió una cantidad ("1,5 l", "200 g"). */
export const AI_UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'l'] as const;
export type AiUnit = (typeof AI_UNITS)[number];

const GRAMS_PER_UNIT: Record<AiUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  // Los líquidos se toman con densidad 1 g/ml: es una aproximación (el aceite pesa ~0,92), pero
  // mantiene el orden de magnitud, que es lo que importa. Leer litros como mililitros sería ×1000.
  ml: 1,
  l: 1000,
};

export const isAiUnit = (value: unknown): value is AiUnit =>
  typeof value === 'string' && (AI_UNITS as readonly string[]).includes(value);

/** Gramos de `amount` en `unit`, redondeado a 2 decimales. */
export function toGrams(amount: number, unit: AiUnit): number {
  return Math.round(amount * GRAMS_PER_UNIT[unit] * 100) / 100;
}
