import { z } from 'zod';
import type { DayTotals, WeightPoint } from './types';

// PostgREST devuelve `numeric` como número, pero se acepta texto por si cambia la serialización.
const numeric = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());

const dayTotalsRow = z.object({
  day: z.string(),
  kcal: numeric,
  protein_g: numeric,
  carbs_g: numeric,
  fat_g: numeric,
  entries: numeric,
});

const weightRow = z.object({ logged_on: z.string(), weight_kg: numeric });

/** Filas de `daily_totals` → totales. Las filas que no se pueden leer se descartan. */
export function parseDayTotals(rows: unknown): DayTotals[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = dayTotalsRow.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseWeights(rows: unknown): WeightPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = weightRow.safeParse(row);
    return parsed.success && parsed.data.weight_kg > 0
      ? [{ day: parsed.data.logged_on, weightKg: parsed.data.weight_kg }]
      : [];
  });
}
