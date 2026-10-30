import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { catalogFoodToRow, createSupabaseFoodStore, rowToCatalogFood } from './repository';
import type { CatalogFood } from './types';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  source: 'off',
  source_id: '7790070410108',
  barcode: '7790070410108',
  name: 'Leche',
  brand: 'La Serenísima',
  kcal_100g: 62,
  protein_100g: 3.1,
  carbs_100g: 4.7,
  fat_100g: 3.3,
  fiber_100g: null,
  sugar_100g: 4.7,
  sodium_mg_100g: 45,
  portions: [{ label: '1 vaso', grams: 200 }],
  created_by: null,
  ...overrides,
});

type Result = { data: unknown; error: { message: string } | null };

/** Cliente de Supabase falso con la forma de las llamadas que usa el catálogo. */
function fakeClient(result: Result) {
  const calls: Record<string, unknown[]> = {};
  const builder = {
    select: vi.fn((...args: unknown[]) => {
      calls.select = args;
      return builder;
    }),
    eq: vi.fn((...args: unknown[]) => {
      calls.eq = args;
      return builder;
    }),
    limit: vi.fn(async (...args: unknown[]) => {
      calls.limit = args;
      return result;
    }),
    upsert: vi.fn((...args: unknown[]) => {
      calls.upsert = args;
      return builder;
    }),
    then: (resolve: (value: Result) => unknown) => resolve(result),
  };
  const client = {
    rpc: vi.fn(async (...args: unknown[]) => {
      calls.rpc = args;
      return result;
    }),
    from: vi.fn((table: string) => {
      calls.from = [table];
      return builder;
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const unused = fakeClient({ data: null, error: null }).client;

describe('rowToCatalogFood', () => {
  it('mapea la fila al alimento, omitiendo los opcionales nulos', () => {
    // La función recibe filas ya validadas por zod: los numéricos nulos llegan como `undefined`.
    const parsed = { ...row(), fiber_100g: undefined };
    expect(rowToCatalogFood(parsed as never)).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      source: 'off',
      sourceId: '7790070410108',
      barcode: '7790070410108',
      name: 'Leche',
      brand: 'La Serenísima',
      per100g: { kcal: 62, protein_g: 3.1, carbs_g: 4.7, fat_g: 3.3, sugar_g: 4.7, sodium_mg: 45 },
      portions: [{ label: '1 vaso', grams: 200 }],
      createdBy: null,
    });
  });
});

describe('catalogFoodToRow', () => {
  it('arma la fila del catálogo compartido (created_by null) y completa nulos', () => {
    const food: CatalogFood = {
      id: '',
      source: 'usda',
      sourceId: '171265',
      name: 'Beef',
      per100g: { kcal: 215, protein_g: 18, carbs_g: 0, fat_g: 15 },
      portions: [],
    };
    expect(catalogFoodToRow(food)).toEqual({
      source: 'usda',
      source_id: '171265',
      barcode: null,
      name: 'Beef',
      brand: null,
      kcal_100g: 215,
      protein_100g: 18,
      carbs_100g: 0,
      fat_100g: 15,
      fiber_100g: null,
      sugar_100g: null,
      sodium_mg_100g: null,
      portions: [],
      created_by: null,
    });
  });
});

describe('FoodStore.search', () => {
  it('llama a search_foods y agrega favorito, último uso y relevancia', async () => {
    const { client, calls } = fakeClient({
      data: [row({ is_favorite: true, last_used_on: '2026-01-09', score: '0.9' })],
      error: null,
    });
    const [food] = await createSupabaseFoodStore({ user: client, admin: unused }).search('leche');

    expect(calls.rpc).toEqual(['search_foods', { q: 'leche', max_results: 40 }]);
    expect(food).toMatchObject({
      name: 'Leche',
      isFavorite: true,
      lastUsedOn: '2026-01-09',
      score: 0.9,
    });
  });

  it('acepta numéricos como string y tolera porciones inválidas', async () => {
    const { client } = fakeClient({
      data: [
        row({
          kcal_100g: '62.5',
          portions: 'no-es-una-lista',
          is_favorite: false,
          last_used_on: null,
          score: 0.3,
        }),
      ],
      error: null,
    });
    const [food] = await createSupabaseFoodStore({ user: client, admin: unused }).search('leche');
    expect(food?.per100g.kcal).toBe(62.5);
    expect(food?.portions).toEqual([]);
  });

  it('lanza si la función falla o si una fila no tiene el formato esperado', async () => {
    const failing = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(
      createSupabaseFoodStore({ user: failing.client, admin: unused }).search('x'),
    ).rejects.toThrow('boom');

    const malformed = fakeClient({ data: [{ id: 1 }], error: null });
    await expect(
      createSupabaseFoodStore({ user: malformed.client, admin: unused }).search('x'),
    ).rejects.toThrow();
  });

  it('sin filas devuelve una lista vacía', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await createSupabaseFoodStore({ user: client, admin: unused }).search('x')).toEqual([]);
  });
});

describe('FoodStore.findByBarcode', () => {
  it('consulta por código y prefiere la versión corregida por el usuario', async () => {
    const { client, calls } = fakeClient({
      data: [
        row(),
        row({
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Leche (corregida)',
          created_by: 'user-1',
        }),
      ],
      error: null,
    });
    const food = await createSupabaseFoodStore({ user: client, admin: unused }).findByBarcode(
      '7790070410108',
    );

    expect(calls.from).toEqual(['foods']);
    expect(calls.eq).toEqual(['barcode', '7790070410108']);
    expect(food?.name).toBe('Leche (corregida)');
  });

  it('sin la del usuario devuelve la del catálogo; sin nada, null', async () => {
    const one = fakeClient({ data: [row()], error: null });
    expect(
      (await createSupabaseFoodStore({ user: one.client, admin: unused }).findByBarcode('1'))?.name,
    ).toBe('Leche');
    const none = fakeClient({ data: [], error: null });
    expect(
      await createSupabaseFoodStore({ user: none.client, admin: unused }).findByBarcode('1'),
    ).toBeNull();
  });

  it('lanza si la consulta falla', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(
      createSupabaseFoodStore({ user: client, admin: unused }).findByBarcode('1'),
    ).rejects.toThrow('boom');
  });
});

describe('FoodStore.saveShared', () => {
  const off = (sourceId: string, name: string): CatalogFood => ({
    id: '',
    source: 'off',
    sourceId,
    name,
    per100g: { kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1 },
    portions: [],
  });

  it('hace upsert por (source, source_id) con el cliente de servicio, sin repetidos, y devuelve ids', async () => {
    const admin = fakeClient({ data: [row()], error: null });
    const user = fakeClient({ data: null, error: null });
    const saved = await createSupabaseFoodStore({
      user: user.client,
      admin: admin.client,
    }).saveShared([off('1', 'A'), off('1', 'A (repetido)'), off('2', 'B')]);

    const [rows, options] = admin.calls.upsert as [{ source_id: string; name: string }[], unknown];
    expect(rows.map((r) => `${r.source_id}:${r.name}`)).toEqual(['1:A (repetido)', '2:B']);
    expect(options).toEqual({ onConflict: 'source,source_id' });
    expect(saved).toHaveLength(1);
    expect(user.client.from).not.toHaveBeenCalled();
  });

  it('se niega a escribir en el catálogo compartido fuentes que no son off ni usda', async () => {
    const { client } = fakeClient({ data: [], error: null });
    const store = createSupabaseFoodStore({ user: unused, admin: client });
    await expect(store.saveShared([{ ...off('1', 'A'), source: 'custom' }])).rejects.toThrow(
      'custom',
    );
    await expect(store.saveShared([{ ...off('1', 'A'), source: 'ar_seed' }])).rejects.toThrow(
      'ar_seed',
    );
  });

  it('lanza si el upsert falla', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(
      createSupabaseFoodStore({ user: unused, admin: client }).saveShared([off('1', 'A')]),
    ).rejects.toThrow('boom');
  });
});
