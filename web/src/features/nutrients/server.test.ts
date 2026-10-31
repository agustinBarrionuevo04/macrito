import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: h.rpc }) }));

import { getMicroTotals } from './server';

describe('getMicroTotals', () => {
  it('pide la función del día y redondea (fibra y azúcares a 1 decimal, sodio a entero)', async () => {
    h.rpc.mockResolvedValue({
      data: [{ fiber_g: '5.04', sugar_g: 6.55, sodium_mg: '182.5', entries: '4', with_data: 2 }],
      error: null,
    });
    expect(await getMicroTotals('2026-03-10')).toEqual({
      fiber_g: 5,
      sugar_g: 6.6,
      sodium_mg: 183,
      entries: 4,
      withData: 2,
    });
    expect(h.rpc).toHaveBeenCalledWith('micro_totals', { p_day: '2026-03-10' });
  });
  it('una respuesta vacía son todos ceros; un error es null; valores ilegibles cuentan 0', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    expect(await getMicroTotals('2026-03-10')).toEqual({
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
      entries: 0,
      withData: 0,
    });
    h.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await getMicroTotals('2026-03-10')).toBeNull();
    h.rpc.mockResolvedValue({
      data: { fiber_g: 'x', sugar_g: null, sodium_mg: undefined, entries: 1, with_data: 0 },
      error: null,
    });
    expect(await getMicroTotals('2026-03-10')).toEqual({
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
      entries: 1,
      withData: 0,
    });
  });
});
