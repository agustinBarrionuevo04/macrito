import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseOptions, type Row } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown, revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import {
  addCombo,
  deleteRecipe,
  duplicateRecipe,
  importRecipeText,
  saveMealAsCombo,
  saveRecipe,
} from './actions';
import { exportRecipe } from './exchange';

const ME = '11111111-1111-4111-8111-111111111111';
const RID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOOD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const harina = {
  foodId: FOOD,
  name: 'Harina',
  grams: 200,
  kcal_100g: 364,
  protein_100g: 10,
  carbs_100g: 76,
  fat_100g: 1,
};
const huevo = {
  foodId: null,
  name: 'Huevo',
  grams: 100,
  kcal_100g: 143,
  protein_100g: 13,
  carbs_100g: 1,
  fat_100g: 10,
};
const recipe = {
  kind: 'recipe',
  name: 'Tarta',
  servings: 4,
  finalWeightG: null,
  items: [harina, huevo],
};

function setup(
  options: Partial<FakeSupabaseOptions> = {},
  tables: Record<string, Row[]> = {},
  rpc: FakeSupabaseOptions['rpc'] = {
    save_recipe: () => ({ data: RID }),
    delete_recipe: () => ({ data: true }),
  },
) {
  const fake = createFakeSupabase({
    userId: ME,
    rpc,
    tables: {
      recipes: { ownerColumn: 'user_id', rows: tables.recipes ?? [] },
      recipe_items: { ownerColumn: 'user_id', rows: tables.recipe_items ?? [] },
      intake_entries: { ownerColumn: 'user_id', rows: tables.intake_entries ?? [] },
    },
    ...options,
  });
  h.client = {
    from: fake.client.from.bind(fake.client),
    auth: fake.client.auth,
    rpc: fake.client.rpc,
  };
  return fake;
}

const dbRecipe = (extra: Row = {}): Row => ({
  id: RID,
  user_id: ME,
  kind: 'recipe',
  name: 'Tarta',
  servings: 4,
  final_weight_g: null,
  food_id: FOOD,
  ...extra,
});
const dbItem = (position: number, extra: Row = {}): Row => ({
  recipe_id: RID,
  user_id: ME,
  position,
  food_id: null,
  name: 'Harina',
  grams: 200,
  kcal_100g: 364,
  protein_100g: 10,
  carbs_100g: 76,
  fat_100g: 1,
  ...extra,
});

beforeEach(() => {
  h.revalidatePath.mockClear();
  setup();
});

describe('saveRecipe', () => {
  it('calcula en el servidor los valores por 100 g y la porción, y se los pasa a la función atómica', async () => {
    const fake = setup();
    const result = await saveRecipe(null, recipe);
    expect(result).toEqual({ ok: true, id: RID });
    const [call] = fake.rpcCalls;
    expect(call?.name).toBe('save_recipe');
    expect(call?.args.p_id).toBeNull();
    expect(call?.args.p_recipe).toEqual({
      kind: 'recipe',
      name: 'Tarta',
      servings: 4,
      final_weight_g: null,
    });
    expect(call?.args.p_food).toEqual({
      name: 'Tarta',
      kcal_100g: 290.33,
      protein_100g: 11,
      carbs_100g: 51,
      fat_100g: 4,
      portions: [{ label: '1 porción', grams: 75 }],
    });
    expect((call?.args.p_items as Row[])[0]).toEqual({
      food_id: FOOD,
      name: 'Harina',
      grams: 200,
      kcal_100g: 364,
      protein_100g: 10,
      carbs_100g: 76,
      fat_100g: 1,
    });
    expect(h.revalidatePath).toHaveBeenCalledWith('/recipes');
  });

  it('un valor por 100 g que mande el cliente para la receta no se usa: sale de los ingredientes', async () => {
    const fake = setup();
    await saveRecipe(null, { ...recipe, kcal_100g: 1, food: { kcal_100g: 1 } });
    expect((fake.rpcCalls[0]?.args.p_food as Row).kcal_100g).toBe(290.33);
  });

  it('editar pasa el id; el peso final cambia los valores por 100 g', async () => {
    const fake = setup();
    await saveRecipe(RID, { ...recipe, finalWeightG: 250 });
    expect(fake.rpcCalls[0]?.args.p_id).toBe(RID);
    expect((fake.rpcCalls[0]?.args.p_food as Row).kcal_100g).toBe(348.4);
  });

  it('un combo no crea alimento y ignora porciones y peso final', async () => {
    const fake = setup();
    await saveRecipe(null, {
      kind: 'combo',
      name: 'Desayuno',
      servings: 6,
      finalWeightG: 10,
      items: [huevo],
    });
    const args = fake.rpcCalls[0]!.args;
    expect(args.p_food).toBeNull();
    expect(args.p_recipe).toEqual({
      kind: 'combo',
      name: 'Desayuno',
      servings: 1,
      final_weight_g: null,
    });
  });

  it('rechaza datos inválidos sin llamar a la base', async () => {
    const fake = setup();
    const bad = [
      { ...recipe, name: '   ' },
      { ...recipe, name: 'x'.repeat(101) },
      { ...recipe, servings: 0 },
      { ...recipe, servings: 101 },
      { ...recipe, finalWeightG: -5 },
      { ...recipe, items: [] },
      { ...recipe, items: Array.from({ length: 41 }, () => huevo) },
      { ...recipe, items: [{ ...huevo, grams: 0 }] },
      { ...recipe, items: [{ ...huevo, grams: 10_001 }] },
      { ...recipe, items: [{ ...huevo, kcal_100g: 5000 }] },
      { ...recipe, items: [{ ...huevo, name: '' }] },
      { ...recipe, kind: 'otro' },
      null,
    ];
    for (const input of bad)
      expect(await saveRecipe(null, input), JSON.stringify(input).slice(0, 60)).toMatchObject({
        ok: false,
      });
    expect(await saveRecipe('no-es-id', recipe)).toMatchObject({ ok: false });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('una receta con valores imposibles (peso final muy bajo) se rechaza con un mensaje claro', async () => {
    const fake = setup();
    const result = await saveRecipe(null, { ...recipe, finalWeightG: 50 });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('no son posibles') });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('sin sesión pide ingresar de nuevo', async () => {
    setup({ userId: null });
    expect(await saveRecipe(null, recipe)).toEqual({
      ok: false,
      error: expect.stringContaining('sesión'),
    });
  });

  it('traduce los errores de la base sin filtrar el detalle', async () => {
    setup(
      {},
      {},
      {
        save_recipe: () => ({
          data: null,
          error: { message: 'receta inexistente', code: 'P0002' },
        }),
      },
    );
    expect(await saveRecipe(RID, recipe)).toEqual({
      ok: false,
      error: expect.stringContaining('No encontramos'),
    });
    setup(
      {},
      {},
      { save_recipe: () => ({ data: null, error: { message: 'SECRETO interno', code: 'XX000' } }) },
    );
    const result = await saveRecipe(null, recipe);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain('SECRETO');
  });
});

describe('deleteRecipe', () => {
  it('borra por la función atómica', async () => {
    const fake = setup();
    expect(await deleteRecipe(RID)).toEqual({ ok: true });
    expect(fake.rpcCalls[0]).toEqual({ name: 'delete_recipe', args: { p_id: RID } });
  });
  it('si no existe o es de otro usuario (la función devuelve false), avisa', async () => {
    setup({}, {}, { delete_recipe: () => ({ data: false }) });
    expect(await deleteRecipe(RID)).toMatchObject({
      ok: false,
      error: expect.stringContaining('No encontramos'),
    });
  });
  it('valida el id y la sesión', async () => {
    expect(await deleteRecipe('x')).toMatchObject({ ok: false });
    setup({ userId: null });
    expect(await deleteRecipe(RID)).toMatchObject({ ok: false });
  });
});

describe('duplicateRecipe', () => {
  it('guarda una copia con otro nombre y los mismos ingredientes (sin tocar la original)', async () => {
    const fake = setup(
      {},
      {
        recipes: [dbRecipe()],
        recipe_items: [dbItem(1, { name: 'Huevo', grams: 100 }), dbItem(0)],
      },
    );
    expect(await duplicateRecipe(RID)).toEqual({ ok: true, id: RID });
    const args = fake.rpcCalls[0]!.args;
    expect(args.p_id).toBeNull();
    expect((args.p_recipe as Row).name).toBe('Copia de Tarta');
    expect((args.p_items as Row[]).map((i) => i.name)).toEqual(['Harina', 'Huevo']); // en orden de posición
  });
  it('el nombre de la copia no pasa de 100 caracteres', async () => {
    const fake = setup(
      {},
      { recipes: [dbRecipe({ name: 'x'.repeat(100) })], recipe_items: [dbItem(0)] },
    );
    await duplicateRecipe(RID);
    expect(((fake.rpcCalls[0]!.args.p_recipe as Row).name as string).length).toBe(100);
  });
  it('falla si la receta no existe o no es del usuario', async () => {
    setup({}, { recipes: [dbRecipe({ user_id: 'otro' })], recipe_items: [dbItem(0)] });
    expect(await duplicateRecipe(RID)).toMatchObject({ ok: false });
  });
});

describe('importRecipeText', () => {
  it('importa el texto exportado como una receta nueva', async () => {
    const fake = setup();
    const text = exportRecipe({ ...recipe, kind: 'recipe', items: [harina, huevo] } as never);
    expect(await importRecipeText(text)).toEqual({ ok: true, id: RID });
    expect((fake.rpcCalls[0]!.args.p_items as Row[]).every((i) => i.food_id === null)).toBe(true);
  });
  it('rechaza lo que no es una receta, con el mensaje que corresponde', async () => {
    const fake = setup();
    expect(await importRecipeText('')).toMatchObject({
      ok: false,
      error: expect.stringContaining('Pegá'),
    });
    expect(await importRecipeText('hola')).toMatchObject({
      ok: false,
      error: expect.stringContaining('exportada'),
    });
    expect(await importRecipeText('{"a":1}')).toMatchObject({
      ok: false,
      error: expect.stringContaining('formato'),
    });
    expect(await importRecipeText(42)).toMatchObject({ ok: false });
    expect(
      await importRecipeText(
        JSON.stringify({ macritos: 1, kind: 'recipe', name: 'x', servings: 0, items: [huevo] }),
      ),
    ).toMatchObject({ ok: false });
    expect(fake.rpcCalls).toEqual([]);
  });
});

describe('addCombo', () => {
  const combo = dbRecipe({ kind: 'combo', food_id: null, servings: 1 });
  const items = [
    dbItem(0, {
      name: 'Café con leche',
      grams: 250,
      kcal_100g: 30,
      protein_100g: 2,
      carbs_100g: 3,
      fat_100g: 1,
    }),
    dbItem(1, {
      name: 'Tostada',
      grams: 40,
      kcal_100g: 280,
      protein_100g: 9,
      carbs_100g: 50,
      fat_100g: 3,
    }),
  ];

  it('agrega cada alimento como su propia entrada, con la nutrición calculada, en orden', async () => {
    const fake = setup({}, { recipes: [combo], recipe_items: items });
    expect(await addCombo(RID, '2026-03-15', 'breakfast')).toEqual({ ok: true, count: 2 });
    const entries = fake
      .rows('intake_entries')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    expect(entries).toEqual([
      expect.objectContaining({
        user_id: ME,
        logged_on: '2026-03-15',
        meal_type: 'breakfast',
        name: 'Café con leche',
        quantity_g: 250,
        kcal: 75,
        protein_g: 5,
        carbs_g: 7.5,
        fat_g: 2.5,
        origin: 'recipe',
        is_estimate: false,
      }),
      expect.objectContaining({
        name: 'Tostada',
        quantity_g: 40,
        kcal: 112,
        protein_g: 3.6,
        carbs_g: 20,
        fat_g: 1.2,
      }),
    ]);
  });
  it('no agrega nada si no es un combo propio, o si los datos son inválidos', async () => {
    const fake = setup({}, { recipes: [dbRecipe()], recipe_items: items }); // es una receta, no un combo
    expect(await addCombo(RID, '2026-03-15', 'lunch')).toMatchObject({ ok: false });
    setup({}, { recipes: [combo], recipe_items: items });
    expect(await addCombo(RID, '2026-02-30', 'lunch')).toMatchObject({ ok: false });
    expect(await addCombo(RID, '2026-03-15', 'brunch')).toMatchObject({ ok: false });
    expect(await addCombo('x', '2026-03-15', 'lunch')).toMatchObject({ ok: false });
    expect(fake.rows('intake_entries')).toEqual([]);
  });
  it('un error de la base no deja entradas a medias ni filtra el detalle', async () => {
    const fake = setup(
      { failWhen: (c) => (c.op === 'insert' ? 'boom' : null) },
      { recipes: [combo], recipe_items: items },
    );
    const result = await addCombo(RID, '2026-03-15', 'lunch');
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain('boom');
    expect(fake.rows('intake_entries')).toEqual([]);
  });
});

describe('saveMealAsCombo', () => {
  const entry = (extra: Row = {}): Row => ({
    user_id: ME,
    logged_on: '2026-03-15',
    meal_type: 'lunch',
    food_id: FOOD,
    name: 'Milanesa',
    quantity_g: 150,
    kcal: 375,
    protein_g: 30,
    carbs_g: 22.5,
    fat_g: 18,
    origin: 'search',
    is_estimate: false,
    created_at: '2026-03-15T15:00:00.000Z',
    ...extra,
  });

  it('arma el combo con los valores por 100 g sacados de cada entrada', async () => {
    const fake = setup(
      {},
      {
        intake_entries: [
          entry(),
          entry({
            name: 'Puré',
            quantity_g: 200,
            kcal: 180,
            protein_g: 4,
            carbs_g: 30,
            fat_g: 5,
            created_at: '2026-03-15T15:01:00.000Z',
          }),
        ],
      },
    );
    expect(
      await saveMealAsCombo({ day: '2026-03-15', mealType: 'lunch', name: 'Mi almuerzo' }),
    ).toEqual({ ok: true, id: RID });
    const items = fake.rpcCalls[0]!.args.p_items as Row[];
    expect(items[0]).toMatchObject({
      name: 'Milanesa',
      grams: 150,
      kcal_100g: 250,
      protein_100g: 20,
      carbs_100g: 15,
      fat_100g: 12,
    });
    expect(items[1]).toMatchObject({ name: 'Puré', grams: 200, kcal_100g: 90 });
    expect(fake.rpcCalls[0]!.args.p_food).toBeNull();
    expect((fake.rpcCalls[0]!.args.p_recipe as Row).kind).toBe('combo');
  });
  it('las calorías rápidas (sin cantidad) no se guardan; si no queda nada, avisa', async () => {
    const fake = setup(
      {},
      {
        intake_entries: [
          entry({ quantity_g: 0, food_id: null }),
          entry({ meal_type: 'dinner' }),
          entry({ logged_on: '2026-03-14' }),
        ],
      },
    );
    expect(
      await saveMealAsCombo({ day: '2026-03-15', mealType: 'lunch', name: 'x' }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('cantidad') });
    expect(fake.rpcCalls).toEqual([]);
  });
  it('valida día, comida y nombre', async () => {
    setup({}, { intake_entries: [entry()] });
    expect(await saveMealAsCombo({ day: 'hoy', mealType: 'lunch', name: 'x' })).toMatchObject({
      ok: false,
    });
    expect(await saveMealAsCombo({ day: '2026-03-15', mealType: 'x', name: 'x' })).toMatchObject({
      ok: false,
    });
    expect(
      await saveMealAsCombo({ day: '2026-03-15', mealType: 'lunch', name: '  ' }),
    ).toMatchObject({ ok: false });
    expect(await saveMealAsCombo(null)).toMatchObject({ ok: false });
  });
});
