import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseOptions, type Row } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { createCustomFood, setFavorite, updateCustomFood } from './actions';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MINE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SHARED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const THEIRS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const foodRow = (id: string, extra: Row = {}): Row => ({
  id,
  source: 'custom',
  source_id: null,
  barcode: null,
  name: 'Alfajor',
  brand: null,
  kcal_100g: 450,
  protein_100g: 5,
  carbs_100g: 60,
  fat_100g: 20,
  fiber_100g: null,
  sugar_100g: null,
  sodium_mg_100g: null,
  portions: [],
  created_by: ME,
  ...extra,
});

function setup(options: Partial<FakeSupabaseOptions> = {}) {
  const fake = createFakeSupabase({
    userId: ME,
    tables: {
      foods: {
        rows: [
          foodRow(MINE),
          foodRow(SHARED, { source: 'off', source_id: '123', created_by: null }),
          foodRow(THEIRS, { created_by: OTHER }),
        ],
      },
      favorite_foods: { ownerColumn: 'user_id', rows: [] },
    },
    ...options,
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
  return fake;
}

const input = { name: 'Mi pan', kcal: 250, protein_g: 8, carbs_g: 50, fat_g: 2 };

beforeEach(() => setup());

describe('createCustomFood', () => {
  it('guarda un alimento propio y devuelve el Food con su id', async () => {
    const fake = setup();
    const result = await createCustomFood({
      ...input,
      brand: 'Casero',
      barcode: '7790001000019',
      portions: [{ label: '1 rebanada', grams: 30 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.food).toMatchObject({
      name: 'Mi pan',
      brand: 'Casero',
      source: 'custom',
      per100g: { kcal: 250, protein_g: 8, carbs_g: 50, fat_g: 2 },
      portions: [{ label: '1 rebanada', grams: 30 }],
    });
    const saved = fake.rows('foods').find((row) => row.id === result.food.id);
    expect(saved).toMatchObject({ source: 'custom', source_id: null, created_by: ME });
  });

  it('siempre es "custom" y del usuario, aunque el cliente mande otra cosa', async () => {
    const fake = setup();
    const result = await createCustomFood({
      ...input,
      source: 'off',
      created_by: OTHER,
      source_id: 'x',
    });
    expect(result.ok).toBe(true);
    const created = fake.rows('foods').at(-1);
    expect(created).toMatchObject({ source: 'custom', created_by: ME, source_id: null });
  });

  it('rechaza datos inválidos sin tocar la base', async () => {
    const fake = setup();
    expect(await createCustomFood({ ...input, kcal: 5000 })).toMatchObject({ ok: false });
    expect(await createCustomFood(null)).toMatchObject({ ok: false });
    expect(fake.rows('foods')).toHaveLength(3);
  });

  it('pide ingresar de nuevo sin sesión', async () => {
    setup({ userId: null });
    expect(await createCustomFood(input)).toEqual({
      ok: false,
      error: expect.stringContaining('sesión'),
    });
  });

  it('un error de base devuelve un mensaje genérico', async () => {
    setup({ failWhen: (c) => (c.op === 'insert' ? 'boom' : null) });
    const result = await createCustomFood(input);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain('boom');
  });
});

describe('updateCustomFood', () => {
  it('actualiza un alimento propio', async () => {
    const fake = setup();
    const result = await updateCustomFood(MINE, { ...input, name: 'Alfajor triple' });
    expect(result).toMatchObject({ ok: true, food: { id: MINE, name: 'Alfajor triple' } });
    expect(fake.rows('foods').find((r) => r.id === MINE)).toMatchObject({
      name: 'Alfajor triple',
      kcal_100g: 250,
      source: 'custom',
      created_by: ME,
    });
  });

  it('no deja editar el catálogo compartido ni alimentos de otro usuario', async () => {
    const fake = setup();
    expect(await updateCustomFood(SHARED, input)).toMatchObject({
      ok: false,
      error: expect.stringContaining('propios'),
    });
    expect(await updateCustomFood(THEIRS, input)).toMatchObject({ ok: false });
    expect(fake.rows('foods').find((r) => r.id === SHARED)).toMatchObject({
      name: 'Alfajor',
      kcal_100g: 450,
    });
    expect(fake.rows('foods').find((r) => r.id === THEIRS)).toMatchObject({ kcal_100g: 450 });
  });

  it('falla con ids inexistentes o inválidos', async () => {
    setup();
    expect(await updateCustomFood('dd000000-0000-4000-8000-000000000000', input)).toMatchObject({
      ok: false,
    });
    expect(await updateCustomFood('basura', input)).toMatchObject({ ok: false });
  });
});

describe('updateCustomFood: alimentos de una receta', () => {
  it('no deja editar a mano el alimento de una receta (se desincronizaría de sus ingredientes)', async () => {
    const fake = createFakeSupabase({
      userId: ME,
      tables: {
        foods: { rows: [foodRow(MINE)] },
        favorite_foods: { ownerColumn: 'user_id', rows: [] },
        recipes: { ownerColumn: 'user_id', rows: [{ id: 'r1', user_id: ME, food_id: MINE }] },
      },
    });
    h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
    expect(await updateCustomFood(MINE, { ...input, name: 'Otro nombre' })).toEqual({
      ok: false,
      error: expect.stringContaining('receta'),
    });
    expect(fake.rows('foods')[0]).toMatchObject({ name: 'Alfajor' });
  });
});

describe('setFavorite', () => {
  it('agrega y quita favoritos, de forma idempotente', async () => {
    const fake = setup();
    expect(await setFavorite(MINE, true)).toEqual({ ok: true });
    expect(await setFavorite(MINE, true)).toEqual({ ok: true });
    expect(fake.rows('favorite_foods')).toEqual([
      expect.objectContaining({ user_id: ME, food_id: MINE }),
    ]);
    expect(fake.rows('favorite_foods')).toHaveLength(1);
    expect(await setFavorite(MINE, false)).toEqual({ ok: true });
    expect(await setFavorite(MINE, false)).toEqual({ ok: true });
    expect(fake.rows('favorite_foods')).toEqual([]);
  });

  it('valida los argumentos y la sesión', async () => {
    const fake = setup();
    expect(await setFavorite('no-id', true)).toMatchObject({ ok: false });
    expect(await setFavorite(MINE, 'si')).toMatchObject({ ok: false });
    expect(fake.rows('favorite_foods')).toEqual([]);
    setup({ userId: null });
    expect(await setFavorite(MINE, true)).toMatchObject({ ok: false });
  });
});
