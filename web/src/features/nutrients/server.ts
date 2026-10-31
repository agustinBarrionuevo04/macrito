import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MicroTotals } from './reference';

/** Fibra, azúcares y sodio del día (sumados en la base). `null` si falla la consulta. */
export async function getMicroTotals(day: string): Promise<MicroTotals | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('micro_totals', { p_day: day });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row) return { fiber_g: 0, sugar_g: 0, sodium_mg: 0, entries: 0, withData: 0 };
  const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return {
    fiber_g: Math.round(num(row.fiber_g) * 10) / 10,
    sugar_g: Math.round(num(row.sugar_g) * 10) / 10,
    sodium_mg: Math.round(num(row.sodium_mg)),
    entries: num(row.entries),
    withData: num(row.with_data),
  };
}
