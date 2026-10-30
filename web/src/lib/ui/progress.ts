/** Fracción 0–1 de `value` sobre `max`; nunca NaN ni fuera de rango. */
export function progressRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0;
  return Math.min(value / max, 1);
}

/** ¿Se superó la meta? */
export function isOver(value: number, max: number): boolean {
  return Number.isFinite(value) && Number.isFinite(max) && max > 0 && value > max;
}

export type RingGeometry = {
  radius: number;
  circumference: number;
  /** `stroke-dashoffset` para dibujar `ratio` del anillo. */
  offset: number;
  ratio: number;
  over: boolean;
};

export function ringGeometry(input: {
  value: number;
  max: number;
  size: number;
  strokeWidth: number;
}): RingGeometry {
  const { value, max, size, strokeWidth } = input;
  const radius = Math.max((size - strokeWidth) / 2, 0);
  const circumference = 2 * Math.PI * radius;
  const ratio = progressRatio(value, max);
  return {
    radius,
    circumference,
    offset: circumference * (1 - ratio),
    ratio,
    over: isOver(value, max),
  };
}
