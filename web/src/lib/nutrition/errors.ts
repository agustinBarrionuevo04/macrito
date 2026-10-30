/** Entrada fuera de rango o mal formada. Los cálculos no devuelven NaN: lanzan esto. */
export class NutritionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NutritionInputError';
  }
}

export function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new NutritionInputError(`${name} debe ser un número positivo (recibido: ${value})`);
  }
}

export function assertInRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new NutritionInputError(`${name} fuera de rango ${min}–${max} (recibido: ${value})`);
  }
}
