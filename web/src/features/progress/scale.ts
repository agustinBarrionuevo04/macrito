/** Escala lineal de un dominio a un rango de píxeles. Un dominio de un solo valor cae en el medio. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/**
 * Marcas "redondas" para un eje: el paso es 1, 2, 2,5 o 5 por una potencia de 10 y el dominio se
 * extiende hasta la marca más cercana de cada lado. Con `min === max` abre un margen para que haya eje.
 */
export function niceTicks(
  min: number,
  max: number,
  target = 4,
): { ticks: number[]; min: number; max: number; decimals: number } {
  let low = min;
  let high = max;
  if (high === low) {
    const pad = Math.abs(high) > 0 ? Math.abs(high) * 0.05 : 1;
    low -= pad;
    high += pad;
  }
  const rawStep = (high - low) / Math.max(target, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  const start = Math.floor(low / step + 1e-9) * step;
  const end = Math.ceil(high / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  // Decimales que hacen falta para que ninguna marca se redondee a otra al mostrarla (paso 0,2 → 1; 0,05 → 2).
  const decimals = step >= 1 ? 0 : Math.min(Math.ceil(-Math.log10(step) - 1e-9), 3);
  return { ticks, min: ticks[0]!, max: ticks.at(-1)!, decimals };
}

/** Columna con las dos esquinas de arriba redondeadas (4 px) y la base recta, como camino SVG. */
export function columnPath(
  x: number,
  baseline: number,
  width: number,
  height: number,
  radius = 4,
): string {
  if (!(height > 0) || !(width > 0)) return '';
  const r = Math.min(radius, width / 2, height);
  const top = baseline - height;
  return [
    `M${x},${baseline}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + width - r}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `V${baseline}`,
    'Z',
  ].join(' ');
}

/** Índices a rotular en un eje con `count` posiciones: siempre el primero y el último, y pocos en el medio. */
export function labelIndexes(count: number, maxLabels = 4): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const result = new Set<number>([0, count - 1]);
  const slots = maxLabels - 1;
  for (let i = 1; i < slots; i++) result.add(Math.round((i * (count - 1)) / slots));
  return [...result].sort((a, b) => a - b);
}
