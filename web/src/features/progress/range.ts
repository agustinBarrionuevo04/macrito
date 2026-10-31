import { DEFAULT_RANGE, RANGES, type Range } from './constants';

/** Período pedido en la URL (`?range=7|30|90`); cualquier otra cosa cae en 30 días. */
export function parseRange(value: string | undefined): Range {
  const parsed = Number(value);
  return (RANGES as readonly number[]).includes(parsed) ? (parsed as Range) : DEFAULT_RANGE;
}
