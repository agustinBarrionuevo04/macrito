import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseOptions } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { createAiFood } from './actions';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function setup(options: Partial<FakeSupabaseOptions> = {}, rows: Record<string, unknown>[] = []) {
  const fake = createFakeSupabase({ userId: ME, tables: { foods: { rows } }, ...options });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
  return fake;
}

const input = {
  name: 'Budín de zapallo',
  per100g: { kcal: 200, protein_g: 4, carbs_g: 30, fat_g: 7 },
};

beforeEach(() => setup());

describe('createAiFood', () => {
  it('crea un alimento ai_unverified del usuario', async () => {
    const fake = setup();
    const result = await createAiFood(input);
    expect(result).toMatchObject({
      ok: true,
      food: { name: 'Budín de zapallo', source: 'ai_unverified', per100g: { kcal: 200 } },
    });
    expect(fake.rows('foods')[0]).toMatchObject({
      source: 'ai_unverified',
      created_by: ME,
      source_id: null,
    });
  });

  it('reutiliza el que ya tiene con el mismo nombre en vez de duplicar', async () => {
    const fake = setup();
    const first = await createAiFood(input);
    const second = await createAiFood(input);
    expect(first.ok && second.ok && first.food.id === second.food.id).toBe(true);
    expect(fake.rows('foods')).toHaveLength(1);
  });

  it('no reutiliza el de otro usuario ni uno de otra fuente', async () => {
    const base = {
      source_id: null,
      barcode: null,
      brand: null,
      kcal_100g: 1,
      protein_100g: 0,
      carbs_100g: 0,
      fat_100g: 0,
      fiber_100g: null,
      sugar_100g: null,
      sodium_mg_100g: null,
      portions: [],
      name: input.name,
    };
    const fake = setup({}, [
      { ...base, id: 'o1', source: 'ai_unverified', created_by: OTHER },
      { ...base, id: 'c1', source: 'custom', created_by: ME },
    ]);
    const result = await createAiFood(input);
    expect(result.ok && result.food.id).not.toBe('o1');
    expect(result.ok && result.food.id).not.toBe('c1');
    expect(fake.rows('foods')).toHaveLength(3);
  });

  it('rechaza valores imposibles o nombres inválidos sin tocar la base', async () => {
    const fake = setup();
    for (const bad of [
      { ...input, per100g: { kcal: 5000, protein_g: 0, carbs_g: 0, fat_g: 0 } },
      { ...input, per100g: { kcal: 100, protein_g: 90, carbs_g: 90, fat_g: 0 } },
      { ...input, per100g: { kcal: -1, protein_g: 0, carbs_g: 0, fat_g: 0 } },
      { ...input, name: '   ' },
      { ...input, name: 'x'.repeat(101) },
      null,
    ]) {
      expect(await createAiFood(bad)).toMatchObject({ ok: false });
    }
    expect(fake.rows('foods')).toEqual([]);
  });

  it('sin sesión pide ingresar de nuevo', async () => {
    setup({ userId: null });
    expect(await createAiFood(input)).toMatchObject({
      ok: false,
      error: expect.stringContaining('sesión'),
    });
  });

  it('un error de base devuelve un mensaje genérico', async () => {
    setup({ failWhen: (call) => (call.op === 'insert' ? 'boom' : null) });
    const result = await createAiFood(input);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain('boom');
  });
});
