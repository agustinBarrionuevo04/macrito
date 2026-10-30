import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseOptions, type Row } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({
  client: null as unknown,
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import {
  addEntry,
  addQuickEntry,
  copyEntries,
  deleteEntry,
  restoreEntry,
  updateEntry,
} from './actions';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MILK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DAY = '2026-03-15';
const NEXT = '2026-03-16';

const milk: Row = {
  id: MILK,
  source: 'custom',
  source_id: null,
  barcode: null,
  name: 'Leche',
  brand: 'La Serenísima',
  kcal_100g: 60,
  protein_100g: 3,
  carbs_100g: 5,
  fat_100g: 3,
  fiber_100g: null,
  sugar_100g: null,
  sodium_mg_100g: null,
  portions: [],
  created_by: null,
};

const entry = (id: string, extra: Row = {}): Row => ({
  id,
  user_id: ME,
  logged_on: DAY,
  meal_type: 'breakfast',
  food_id: MILK,
  name: 'Leche',
  quantity_g: 200,
  kcal: 120,
  protein_g: 6,
  carbs_g: 10,
  fat_g: 6,
  origin: 'search',
  is_estimate: false,
  created_at: '2026-03-15T11:00:00.000Z',
  ...extra,
});

const ids = {
  a: 'a0000000-0000-4000-8000-00000000000a',
  b: 'b0000000-0000-4000-8000-00000000000b',
  q: 'c0000000-0000-4000-8000-00000000000c',
  other: 'd0000000-0000-4000-8000-00000000000d',
};

function setup(options: Partial<FakeSupabaseOptions> = {}, rows: Row[] = []) {
  const fake = createFakeSupabase({
    userId: ME,
    tables: {
      foods: { rows: [milk] },
      intake_entries: { ownerColumn: 'user_id', rows },
    },
    ...options,
  });
  h.client = {
    from: fake.client.from.bind(fake.client),
    auth: fake.client.auth,
  };
  return fake;
}

const draft = (extra: Record<string, unknown> = {}) => ({
  food: { id: MILK },
  quantity_g: 250,
  meal_type: 'snack',
  origin: 'search',
  is_estimate: false,
  ...extra,
});

beforeEach(() => {
  h.revalidatePath.mockClear();
});

describe('addEntry', () => {
  it('calcula el snapshot en el servidor con los valores del alimento en la base', async () => {
    const fake = setup();
    const result = await addEntry(draft(), DAY);
    expect(result.ok).toBe(true);
    expect(fake.rows('intake_entries')).toEqual([
      expect.objectContaining({
        user_id: ME,
        logged_on: DAY,
        meal_type: 'snack',
        food_id: MILK,
        name: 'Leche (La Serenísima)',
        quantity_g: 250,
        kcal: 150,
        protein_g: 7.5,
        carbs_g: 12.5,
        fat_g: 7.5,
        origin: 'search',
        is_estimate: false,
      }),
    ]);
    expect(h.revalidatePath).toHaveBeenCalledWith('/');
  });

  it('ignora los valores nutricionales que mande el cliente', async () => {
    const fake = setup();
    await addEntry(
      draft({ food: { id: MILK, per100g: { kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0 } } }),
      DAY,
    );
    expect(fake.rows('intake_entries')[0]).toMatchObject({ kcal: 150 });
  });

  it('conserva la marca de estimación', async () => {
    const fake = setup();
    await addEntry(draft({ is_estimate: true, origin: 'ai_photo' }), DAY);
    expect(fake.rows('intake_entries')[0]).toMatchObject({ is_estimate: true, origin: 'ai_photo' });
  });

  it('rechaza cantidades inválidas, fechas inválidas y comidas inexistentes', async () => {
    const fake = setup();
    for (const bad of [
      draft({ quantity_g: 0 }),
      draft({ quantity_g: -5 }),
      draft({ quantity_g: 10_001 }),
      draft({ quantity_g: Number.NaN }),
      draft({ meal_type: 'brunch' }),
      draft({ origin: 'copy' }),
      draft({ food: { id: 'no-es-uuid' } }),
      null,
    ]) {
      expect((await addEntry(bad, DAY)).ok).toBe(false);
    }
    expect((await addEntry(draft(), '2026-02-30')).ok).toBe(false);
    expect((await addEntry(draft(), '1999-01-01')).ok).toBe(false);
    expect(fake.rows('intake_entries')).toEqual([]);
  });

  it('falla si el alimento no existe', async () => {
    const fake = setup();
    const result = await addEntry(draft({ food: { id: ids.other } }), DAY);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('alimento') });
    expect(fake.rows('intake_entries')).toEqual([]);
  });

  it('pide ingresar de nuevo si no hay sesión', async () => {
    setup({ userId: null });
    expect(await addEntry(draft(), DAY)).toEqual({
      ok: false,
      error: expect.stringContaining('sesión'),
    });
  });

  it('devuelve un error genérico si falla la base', async () => {
    setup({ failWhen: (call) => (call.op === 'insert' ? 'boom' : null) });
    const result = await addEntry(draft(), DAY);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain('boom');
  });
});

describe('addQuickEntry', () => {
  it('guarda un valor manual sin alimento ni cantidad', async () => {
    const fake = setup();
    const result = await addQuickEntry(
      { name: '  Pizza  ', kcal: 450, protein_g: 20, meal_type: 'dinner' },
      DAY,
    );
    expect(result.ok).toBe(true);
    expect(fake.rows('intake_entries')[0]).toMatchObject({
      name: 'Pizza',
      kcal: 450,
      protein_g: 20,
      carbs_g: 0,
      fat_g: 0,
      food_id: null,
      quantity_g: 0,
      origin: 'manual',
      is_estimate: false,
      meal_type: 'dinner',
    });
  });

  it('sin descripción usa un nombre por defecto', async () => {
    const fake = setup();
    await addQuickEntry({ name: '   ', kcal: 100, meal_type: 'snack' }, DAY);
    expect(fake.rows('intake_entries')[0]).toMatchObject({ name: 'Calorías rápidas' });
  });

  it('rechaza calorías vacías, cero o negativas y macros negativos', async () => {
    const fake = setup();
    for (const bad of [
      { meal_type: 'snack' },
      { kcal: 0, meal_type: 'snack' },
      { kcal: -1, meal_type: 'snack' },
      { kcal: 100, protein_g: -1, meal_type: 'snack' },
      { kcal: 100, meal_type: 'nope' },
      { kcal: 100, name: 'x'.repeat(101), meal_type: 'snack' },
    ]) {
      expect((await addQuickEntry(bad, DAY)).ok).toBe(false);
    }
    expect(fake.rows('intake_entries')).toEqual([]);
  });
});

describe('updateEntry', () => {
  it('reescala la nutrición desde la propia entrada, no desde el alimento', async () => {
    // El alimento ahora dice 60 kcal/100 g, pero la entrada se guardó con 0,5 kcal/g (100 por 200 g).
    const fake = setup({}, [entry(ids.a, { kcal: 100, protein_g: 5, carbs_g: 8, fat_g: 4 })]);
    const result = await updateEntry(ids.a, { quantity_g: 300 });
    expect(result).toEqual({ ok: true });
    expect(fake.rows('intake_entries')[0]).toMatchObject({
      quantity_g: 300,
      kcal: 150,
      protein_g: 7.5,
      carbs_g: 12,
      fat_g: 6,
    });
  });

  it('cambiar solo la comida no toca la nutrición', async () => {
    const fake = setup({}, [entry(ids.a)]);
    await updateEntry(ids.a, { meal_type: 'dinner' });
    expect(fake.rows('intake_entries')[0]).toMatchObject({ meal_type: 'dinner', kcal: 120 });
  });

  it('no deja cambiar la cantidad de una entrada de calorías rápidas, pero sí la comida', async () => {
    const fake = setup({}, [entry(ids.q, { quantity_g: 0, food_id: null, origin: 'manual' })]);
    expect(await updateEntry(ids.q, { quantity_g: 100 })).toMatchObject({ ok: false });
    expect(await updateEntry(ids.q, { meal_type: 'lunch' })).toEqual({ ok: true });
    expect(fake.rows('intake_entries')[0]).toMatchObject({ kcal: 120, meal_type: 'lunch' });
  });

  it('exige al menos un cambio válido', async () => {
    setup({}, [entry(ids.a)]);
    expect(await updateEntry(ids.a, {})).toMatchObject({ ok: false });
    expect(await updateEntry(ids.a, { quantity_g: 0 })).toMatchObject({ ok: false });
    expect(await updateEntry(ids.a, { meal_type: 'x' })).toMatchObject({ ok: false });
  });

  it('no puede tocar entradas de otro usuario (RLS)', async () => {
    const fake = setup({}, [entry(ids.other, { user_id: OTHER })]);
    expect(await updateEntry(ids.other, { quantity_g: 1 })).toMatchObject({ ok: false });
    expect(fake.rows('intake_entries')[0]).toMatchObject({ quantity_g: 200 });
  });

  it('una cantidad igual no escribe nada', async () => {
    const fake = setup({}, [entry(ids.a)]);
    expect(await updateEntry(ids.a, { quantity_g: 200 })).toEqual({ ok: true });
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false);
  });
});

describe('deleteEntry', () => {
  it('borra la entrada propia', async () => {
    const fake = setup({}, [entry(ids.a), entry(ids.b)]);
    expect(await deleteEntry(ids.a)).toEqual({ ok: true });
    expect(fake.rows('intake_entries').map((r) => r.id)).toEqual([ids.b]);
  });

  it('falla si no existe o es de otro usuario', async () => {
    const fake = setup({}, [entry(ids.other, { user_id: OTHER })]);
    expect(await deleteEntry(ids.other)).toMatchObject({ ok: false });
    expect(await deleteEntry('basura')).toMatchObject({ ok: false });
    expect(fake.rows('intake_entries')).toHaveLength(1);
  });
});

describe('restoreEntry', () => {
  it('vuelve a insertar la entrada con los mismos datos y la misma hora de creación', async () => {
    const fake = setup({}, [entry(ids.a)]);
    await deleteEntry(ids.a);
    const result = await restoreEntry({
      day: DAY,
      mealType: 'breakfast',
      foodId: MILK,
      name: 'Leche',
      quantityG: 200,
      kcal: 120,
      protein_g: 6,
      carbs_g: 10,
      fat_g: 6,
      origin: 'search',
      isEstimate: false,
      createdAt: '2026-03-15T11:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    expect(fake.rows('intake_entries')).toEqual([
      expect.objectContaining({
        user_id: ME,
        logged_on: DAY,
        food_id: MILK,
        kcal: 120,
        created_at: '2026-03-15T11:00:00.000Z',
      }),
    ]);
  });

  it('rechaza datos inválidos', async () => {
    const fake = setup();
    const valid = {
      day: DAY,
      mealType: 'lunch',
      foodId: null,
      name: 'x',
      quantityG: 0,
      kcal: 10,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      origin: 'manual',
      isEstimate: false,
      createdAt: '2026-03-15T11:00:00.000Z',
    };
    expect((await restoreEntry({ ...valid, kcal: -1 })).ok).toBe(false);
    expect((await restoreEntry({ ...valid, day: 'hoy' })).ok).toBe(false);
    expect((await restoreEntry({ ...valid, createdAt: 'ayer' })).ok).toBe(false);
    expect(fake.rows('intake_entries')).toEqual([]);
  });
});

describe('copyEntries', () => {
  const rows = [
    entry(ids.a, { created_at: '2026-03-15T11:00:00.000Z' }),
    entry(ids.b, { meal_type: 'lunch', created_at: '2026-03-15T15:00:00.000Z', kcal: 500 }),
    entry(ids.q, {
      meal_type: 'lunch',
      created_at: '2026-03-15T15:30:00.000Z',
      quantity_g: 0,
      food_id: null,
      origin: 'manual',
      kcal: 300,
    }),
    entry(ids.other, { user_id: OTHER, kcal: 9999 }),
  ];

  it('copia una entrada a otro día con origen "copy" y la misma nutrición', async () => {
    const fake = setup({}, rows);
    const result = await copyEntries({ source: { scope: 'entry', id: ids.a }, toDay: NEXT });
    expect(result).toEqual({ ok: true, count: 1 });
    const copies = fake.rows('intake_entries').filter((r) => r.logged_on === NEXT);
    expect(copies).toEqual([
      expect.objectContaining({
        user_id: ME,
        origin: 'copy',
        kcal: 120,
        meal_type: 'breakfast',
        food_id: MILK,
        quantity_g: 200,
      }),
    ]);
    expect(copies[0]?.id).not.toBe(ids.a);
  });

  it('una entrada se puede copiar a otra comida, incluso el mismo día', async () => {
    const fake = setup({}, rows);
    const result = await copyEntries({
      source: { scope: 'entry', id: ids.a },
      toDay: DAY,
      toMeal: 'dinner',
    });
    expect(result.ok).toBe(true);
    expect(
      fake.rows('intake_entries').filter((r) => r.origin === 'copy' && r.meal_type === 'dinner'),
    ).toHaveLength(1);
  });

  it('copia una comida entera conservando el orden', async () => {
    const fake = setup({}, rows);
    const result = await copyEntries({
      source: { scope: 'meal', day: DAY, mealType: 'lunch' },
      toDay: NEXT,
    });
    expect(result).toEqual({ ok: true, count: 2 });
    const copies = fake
      .rows('intake_entries')
      .filter((r) => r.logged_on === NEXT)
      .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
    expect(copies.map((r) => r.kcal)).toEqual([500, 300]);
    expect(copies.every((r) => r.meal_type === 'lunch' && r.origin === 'copy')).toBe(true);
    // Las calorías rápidas se copian tal cual, sin cantidad.
    expect(copies[1]).toMatchObject({ quantity_g: 0, food_id: null });
  });

  it('copia el día entero y nunca toma entradas de otro usuario', async () => {
    const fake = setup({}, rows);
    const result = await copyEntries({ source: { scope: 'day', day: DAY }, toDay: NEXT });
    expect(result).toEqual({ ok: true, count: 3 });
    const kcal = fake
      .rows('intake_entries')
      .filter((r) => r.logged_on === NEXT)
      .map((r) => r.kcal);
    expect(kcal).not.toContain(9999);
  });

  it('no copia una comida o un día sobre sí mismo', async () => {
    const fake = setup({}, rows);
    expect(
      await copyEntries({ source: { scope: 'meal', day: DAY, mealType: 'lunch' }, toDay: DAY }),
    ).toMatchObject({ ok: false });
    expect(await copyEntries({ source: { scope: 'day', day: DAY }, toDay: DAY })).toMatchObject({
      ok: false,
    });
    expect(fake.rows('intake_entries')).toHaveLength(4);
  });

  it('avisa si no hay nada para copiar', async () => {
    setup({}, rows);
    expect(
      await copyEntries({ source: { scope: 'day', day: '2026-01-01' }, toDay: NEXT }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('copiar') });
    expect(
      await copyEntries({ source: { scope: 'entry', id: ids.other }, toDay: NEXT }),
    ).toMatchObject({ ok: false });
  });

  it('valida el pedido', async () => {
    setup({}, rows);
    for (const bad of [
      null,
      { source: { scope: 'weird' }, toDay: NEXT },
      { source: { scope: 'day', day: DAY }, toDay: 'mañana' },
      { source: { scope: 'entry', id: 'x' }, toDay: NEXT },
    ]) {
      expect((await copyEntries(bad)).ok).toBe(false);
    }
  });
});
