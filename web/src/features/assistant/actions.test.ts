import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseOptions, type Row } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown, revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { addSuggestion } from './actions';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const POLLO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const ARROZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02';
const AJENO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03';
const DAY = '2026-03-15';

const food = (id: string, name: string, kcal: number, createdBy: string | null = null): Row => ({
  id,
  source: createdBy ? 'custom' : 'ar_seed',
  source_id: null,
  barcode: null,
  name,
  brand: null,
  kcal_100g: kcal,
  protein_100g: 10,
  carbs_100g: 20,
  fat_100g: 5,
  fiber_100g: null,
  sugar_100g: null,
  sodium_mg_100g: null,
  portions: [],
  created_by: createdBy,
});

function setup(options: Partial<FakeSupabaseOptions> = {}) {
  const fake = createFakeSupabase({
    userId: ME,
    tables: {
      foods: {
        rows: [
          food(POLLO, 'Pechuga de pollo', 165),
          food(ARROZ, 'Arroz', 130),
          food(AJENO, 'Secreto', 500, OTHER),
        ],
      },
      intake_entries: { ownerColumn: 'user_id', rows: [] },
    },
    ...options,
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
  return fake;
}

const items = [
  { foodId: POLLO, grams: 150 },
  { foodId: ARROZ, grams: 200 },
];

beforeEach(() => {
  h.revalidatePath.mockClear();
  setup();
});

describe('addSuggestion', () => {
  it('agrega una entrada por alimento, con la nutrición calculada desde la base y origen ai_text', async () => {
    const fake = setup();
    const result = await addSuggestion(DAY, { meal: 'dinner', items });
    expect(result).toEqual({ ok: true, count: 2 });
    const rows = fake.rows('intake_entries');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: ME,
      logged_on: DAY,
      meal_type: 'dinner',
      food_id: POLLO,
      name: 'Pechuga de pollo',
      quantity_g: 150,
      kcal: 247.5,
      protein_g: 15,
      carbs_g: 30,
      fat_g: 7.5,
      origin: 'ai_text',
      is_estimate: false,
    });
    expect(rows[1]).toMatchObject({ food_id: ARROZ, kcal: 260 });
    expect(String(rows[0]!.created_at) < String(rows[1]!.created_at)).toBe(true);
    expect(h.revalidatePath).toHaveBeenCalledWith('/');
  });

  it('ignora lo que mande el cliente aparte de ids y gramos (no se pueden inventar calorías)', async () => {
    const fake = setup();
    await addSuggestion(DAY, {
      meal: 'lunch',
      items: [{ foodId: POLLO, grams: 100, kcal: 1, name: 'Gratis' }],
      kcal: 1,
    });
    expect(fake.rows('intake_entries')[0]).toMatchObject({ kcal: 165, name: 'Pechuga de pollo' });
  });

  it('un alimento inexistente cancela todo: no se agrega media comida (la visibilidad de alimentos ajenos la cubre la RLS)', async () => {
    const fake = setup();
    for (const foodId of ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99']) {
      const result = await addSuggestion(DAY, {
        meal: 'dinner',
        items: [items[0], { foodId, grams: 100 }],
      });
      expect(result).toMatchObject({ ok: false });
    }
    expect(fake.rows('intake_entries')).toHaveLength(0);
  });

  it('rechaza entradas inválidas', async () => {
    const fake = setup();
    const bad: unknown[] = [
      null,
      { meal: 'brunch', items },
      { meal: 'dinner', items: [] },
      { meal: 'dinner', items: [{ foodId: 'no-es-guid', grams: 100 }] },
      { meal: 'dinner', items: [{ foodId: POLLO, grams: 0 }] },
      { meal: 'dinner', items: [{ foodId: POLLO, grams: 3001 }] },
      { meal: 'dinner', items: Array.from({ length: 9 }, () => items[0]) },
    ];
    for (const raw of bad)
      expect(await addSuggestion(DAY, raw), JSON.stringify(raw)).toMatchObject({ ok: false });
    expect(await addSuggestion('2026-02-30', { meal: 'dinner', items })).toMatchObject({
      ok: false,
    });
    expect(fake.rows('intake_entries')).toHaveLength(0);
  });

  it('sin sesión no escribe', async () => {
    const fake = setup({ userId: null });
    expect(await addSuggestion(DAY, { meal: 'dinner', items })).toMatchObject({ ok: false });
    expect(fake.rows('intake_entries')).toHaveLength(0);
  });

  it('un error de la base no filtra detalles', async () => {
    setup({
      failWhen: (call) =>
        call.op === 'insert' ? 'duplicate key value violates "secret_constraint"' : null,
    });
    const result = await addSuggestion(DAY, { meal: 'dinner', items });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toMatch(/secret_constraint|duplicate/);
  });
});
