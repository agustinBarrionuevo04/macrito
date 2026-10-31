import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseOptions, type Row } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown, revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { addWater, setWaterGoal, undoLastWater } from './actions';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DAY = '2026-03-15';

const log = (id: string, ml: number, created_at: string, extra: Row = {}): Row => ({
  id,
  user_id: ME,
  logged_on: DAY,
  ml,
  created_at,
  ...extra,
});

function setup(
  options: Partial<FakeSupabaseOptions> = {},
  water: Row[] = [],
  profiles: Row[] = [{ user_id: ME, water_goal_ml: null }],
) {
  const fake = createFakeSupabase({
    userId: ME,
    tables: {
      water_logs: { ownerColumn: 'user_id', rows: water },
      profiles: { ownerColumn: 'user_id', rows: profiles },
    },
    ...options,
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
  return fake;
}

beforeEach(() => {
  h.revalidatePath.mockClear();
  setup();
});

describe('addWater', () => {
  it('guarda la toma del día para el usuario de la sesión', async () => {
    const fake = setup();
    const result = await addWater(DAY, 330);
    expect(result.ok).toBe(true);
    expect(fake.rows('water_logs')).toEqual([
      expect.objectContaining({ user_id: ME, logged_on: DAY, ml: 330 }),
    ]);
    expect(h.revalidatePath).toHaveBeenCalledWith('/');
  });
  it('rechaza cantidades inválidas y fechas inválidas', async () => {
    const fake = setup();
    for (const ml of [0, -100, 5001, 250.5, Number.NaN, '250', null]) {
      expect(await addWater(DAY, ml), String(ml)).toMatchObject({ ok: false });
    }
    expect(await addWater('2026-02-30', 250)).toMatchObject({ ok: false });
    expect(await addWater(DAY, 5000)).toMatchObject({ ok: true });
    expect(fake.rows('water_logs')).toHaveLength(1);
  });
  it('sin sesión pide ingresar de nuevo; un error de base no filtra el detalle', async () => {
    setup({ userId: null });
    expect(await addWater(DAY, 250)).toEqual({
      ok: false,
      error: expect.stringContaining('sesión'),
    });
    setup({ failWhen: (c) => (c.op === 'insert' ? 'boom' : null) });
    const result = await addWater(DAY, 250);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain('boom');
  });
});

describe('undoLastWater', () => {
  it('borra la toma más reciente del día y dice cuánta era', async () => {
    const fake = setup({}, [
      log('a', 200, '2026-03-15T10:00:00Z'),
      log('b', 500, '2026-03-15T15:00:00Z'),
      log('c', 300, '2026-03-14T20:00:00Z', { logged_on: '2026-03-14' }),
    ]);
    expect(await undoLastWater(DAY)).toEqual({ ok: true, ml: 500 });
    expect(fake.rows('water_logs').map((r) => r.id)).toEqual(['a', 'c']);
  });
  it('no toca las tomas de otro día ni de otro usuario', async () => {
    const fake = setup({}, [log('x', 250, '2026-03-15T10:00:00Z', { user_id: OTHER })]);
    expect(await undoLastWater(DAY)).toMatchObject({
      ok: false,
      error: expect.stringContaining('No hay tomas'),
    });
    expect(fake.rows('water_logs')).toHaveLength(1);
  });
  it('valida el día y la sesión', async () => {
    expect(await undoLastWater('hoy')).toMatchObject({ ok: false });
    setup({ userId: null });
    expect(await undoLastWater(DAY)).toMatchObject({ ok: false });
  });
});

describe('setWaterGoal', () => {
  it('guarda la meta propia en el perfil y permite volver a la sugerida con null', async () => {
    const fake = setup();
    expect(await setWaterGoal(3000)).toEqual({ ok: true });
    expect(fake.rows('profiles')[0]).toMatchObject({ water_goal_ml: 3000 });
    expect(await setWaterGoal(null)).toEqual({ ok: true });
    expect(fake.rows('profiles')[0]).toMatchObject({ water_goal_ml: null });
    expect(h.revalidatePath).toHaveBeenCalledWith('/profile');
  });
  it('rechaza metas fuera de 500–10.000 ml o que no son enteros', async () => {
    const fake = setup();
    for (const bad of [499, 10_001, 2500.5, '3000', Number.NaN, undefined]) {
      expect(await setWaterGoal(bad), String(bad)).toMatchObject({ ok: false });
    }
    expect(fake.rows('profiles')[0]).toMatchObject({ water_goal_ml: null });
  });
  it('no toca el perfil de otro usuario', async () => {
    const fake = setup({}, [], [{ user_id: OTHER, water_goal_ml: null }]);
    expect(await setWaterGoal(3000)).toMatchObject({ ok: false });
    expect(fake.rows('profiles')[0]).toMatchObject({ water_goal_ml: null });
  });
});
