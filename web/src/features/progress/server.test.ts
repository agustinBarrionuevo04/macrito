import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  weights: { data: [] as unknown, error: null as unknown },
  calls: [] as [string, unknown][],
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: h.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => (h.calls.push(['eq', args]), query),
        gte: (...args: unknown[]) => (h.calls.push(['gte', args]), query),
        lte: (...args: unknown[]) => (h.calls.push(['lte', args]), query),
        order: () => Promise.resolve(h.weights),
      };
      return query;
    },
  }),
}));

import { getProgressData } from './server';

beforeEach(() => {
  h.rpc.mockReset();
  h.calls.length = 0;
  h.weights = { data: [], error: null };
});

describe('getProgressData', () => {
  it('pide 90 días de totales y los pesos desde 6 días antes', async () => {
    h.rpc.mockResolvedValue({
      data: [{ day: '2026-03-15', kcal: 2000, protein_g: 1, carbs_g: 1, fat_g: 1, entries: 2 }],
      error: null,
    });
    h.weights = { data: [{ logged_on: '2026-03-14', weight_kg: 80 }], error: null };
    const data = await getProgressData('u1', '2026-03-15');
    expect(h.rpc).toHaveBeenCalledWith('daily_totals', {
      p_from: '2025-12-16',
      p_to: '2026-03-15',
    });
    expect(h.calls).toEqual([
      ['eq', ['user_id', 'u1']],
      ['gte', ['logged_on', '2025-12-10']],
      ['lte', ['logged_on', '2026-03-15']],
    ]);
    expect(data?.totals).toHaveLength(1);
    expect(data?.weights).toEqual([{ day: '2026-03-14', weightKg: 80 }]);
  });

  it('si falla cualquiera de las dos consultas devuelve null (no un resumen a medias)', async () => {
    h.rpc.mockResolvedValue({ data: [], error: { message: 'boom' } });
    expect(await getProgressData('u1', '2026-03-15')).toBeNull();
    h.rpc.mockResolvedValue({ data: [], error: null });
    h.weights = { data: null, error: { message: 'boom' } };
    expect(await getProgressData('u1', '2026-03-15')).toBeNull();
  });
});
