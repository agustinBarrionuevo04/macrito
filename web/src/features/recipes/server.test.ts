import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Row } from '@/test-utils/fake-supabase';

vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { getRecipeDetail, getRecipeList, getRepeatCounts } from './server';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const R1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const R2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const recipe = (id: string, user_id: string, name: string, extra: Row = {}): Row => ({
  id,
  user_id,
  kind: 'recipe',
  name,
  servings: 2,
  final_weight_g: null,
  food_id: null,
  ...extra,
});
const item = (
  recipe_id: string,
  user_id: string,
  position: number,
  name: string,
  grams = 100,
): Row => ({
  recipe_id,
  user_id,
  position,
  food_id: null,
  name,
  grams,
  kcal_100g: 200,
  protein_100g: 10,
  carbs_100g: 20,
  fat_100g: 5,
});
const entry = (logged_on: string, meal_type: string, user_id = ME): Row => ({
  user_id,
  logged_on,
  meal_type,
});

function setup(
  tables: Record<string, Row[]>,
  failWhen?: Parameters<typeof createFakeSupabase>[0]['failWhen'],
) {
  const fake = createFakeSupabase({
    userId: ME,
    failWhen,
    tables: {
      recipes: { ownerColumn: 'user_id', rows: tables.recipes ?? [] },
      recipe_items: { ownerColumn: 'user_id', rows: tables.recipe_items ?? [] },
      intake_entries: { ownerColumn: 'user_id', rows: tables.intake_entries ?? [] },
    },
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
}

describe('getRecipeList', () => {
  it('devuelve solo lo propio, ordenado por nombre, con las kcal por porción', async () => {
    setup({
      recipes: [recipe(R2, ME, 'Zapallo'), recipe(R1, ME, 'Arroz'), recipe('c3', OTHER, 'Ajeno')],
      recipe_items: [
        item(R1, ME, 0, 'Arroz'),
        item(R2, ME, 0, 'Zapallo', 200),
        item('c3', OTHER, 0, 'x'),
      ],
    });
    const list = await getRecipeList(ME);
    expect(list?.map((r) => r.name)).toEqual(['Arroz', 'Zapallo']);
    expect(list?.[0]).toMatchObject({ itemCount: 1, kcal: 100 }); // 200 kcal / 2 porciones
    expect(list?.[1]).toMatchObject({ kcal: 200 });
  });
  it('si falla una consulta devuelve null', async () => {
    setup({ recipes: [recipe(R1, ME, 'Arroz')] }, (call) =>
      call.table === 'recipe_items' ? 'boom' : null,
    );
    expect(await getRecipeList(ME)).toBeNull();
  });
});

describe('getRecipeDetail', () => {
  it('devuelve la receta con los ingredientes en orden de posición', async () => {
    setup({
      recipes: [recipe(R1, ME, 'Tarta')],
      recipe_items: [item(R1, ME, 1, 'Huevo'), item(R1, ME, 0, 'Harina')],
    });
    const detail = await getRecipeDetail(ME, R1);
    expect(detail?.items.map((i) => i.name)).toEqual(['Harina', 'Huevo']);
  });
  it('no devuelve la de otro usuario ni una inexistente', async () => {
    setup({ recipes: [recipe(R1, OTHER, 'Ajena')], recipe_items: [item(R1, OTHER, 0, 'x')] });
    expect(await getRecipeDetail(ME, R1)).toBeNull();
    expect(await getRecipeDetail(ME, R2)).toBeNull();
  });
});

describe('getRepeatCounts', () => {
  it('cuenta las entradas de ayer y de hace 7 días por comida, solo del usuario', async () => {
    setup({
      intake_entries: [
        entry('2026-03-14', 'lunch'),
        entry('2026-03-14', 'lunch'),
        entry('2026-03-14', 'dinner'),
        entry('2026-03-08', 'lunch'),
        entry('2026-03-10', 'lunch'), // otro día: no cuenta
        entry('2026-03-14', 'lunch', OTHER),
      ],
    });
    const { counts, yesterday, lastWeek } = await getRepeatCounts(ME, '2026-03-15');
    expect(yesterday).toBe('2026-03-14');
    expect(lastWeek).toBe('2026-03-08');
    expect(counts.lunch).toEqual({ yesterday: 2, lastWeek: 1 });
    expect(counts.dinner).toEqual({ yesterday: 1, lastWeek: 0 });
    expect(counts.breakfast).toEqual({ yesterday: 0, lastWeek: 0 });
  });
  it('sin registros todo es 0', async () => {
    setup({});
    const { counts } = await getRepeatCounts(ME, '2026-03-15');
    expect(Object.values(counts).every((c) => c.yesterday === 0 && c.lastWeek === 0)).toBe(true);
  });
});
