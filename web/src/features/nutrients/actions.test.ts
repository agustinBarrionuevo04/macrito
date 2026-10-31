import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseOptions, type Row } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown, revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { updateKcalAdjustment, updateMacros } from './actions';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function setup(
  options: Partial<FakeSupabaseOptions> = {},
  profiles: Row[] = [
    { user_id: ME, macro_split: null, protein_g_per_kg: null, kcal_adjustment: 0 },
  ],
) {
  const fake = createFakeSupabase({
    userId: ME,
    tables: { profiles: { ownerColumn: 'user_id', rows: profiles } },
    ...options,
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
  return fake;
}

beforeEach(() => {
  h.revalidatePath.mockClear();
  setup();
});

describe('updateMacros', () => {
  it('guarda porcentajes como fracciones y limpia la proteína por kilo', async () => {
    const fake = setup({}, [
      { user_id: ME, macro_split: null, protein_g_per_kg: 2, kcal_adjustment: 0 },
    ]);
    expect(await updateMacros({ mode: 'percent', carbs: 50, fat: 30, protein: 20 })).toEqual({
      ok: true,
    });
    expect(fake.rows('profiles')[0]).toMatchObject({
      macro_split: { carbs: 0.5, fat: 0.3, protein: 0.2 },
      protein_g_per_kg: null,
    });
    expect(h.revalidatePath).toHaveBeenCalledWith('/profile');
  });
  it('guarda proteína por kilo y limpia el reparto', async () => {
    const fake = setup({}, [
      {
        user_id: ME,
        macro_split: { carbs: 0.5, fat: 0.3, protein: 0.2 },
        protein_g_per_kg: null,
        kcal_adjustment: 0,
      },
    ]);
    await updateMacros({ mode: 'g_per_kg', proteinGPerKg: 1.8 });
    expect(fake.rows('profiles')[0]).toMatchObject({ macro_split: null, protein_g_per_kg: 1.8 });
  });
  it('"por defecto" limpia las dos columnas', async () => {
    const fake = setup({}, [
      {
        user_id: ME,
        macro_split: { carbs: 0.5, fat: 0.3, protein: 0.2 },
        protein_g_per_kg: 2,
        kcal_adjustment: 0,
      },
    ]);
    await updateMacros({ mode: 'default' });
    expect(fake.rows('profiles')[0]).toMatchObject({ macro_split: null, protein_g_per_kg: null });
  });
  it('rechaza lo inválido con el motivo y sin escribir nada', async () => {
    const fake = setup();
    expect(await updateMacros({ mode: 'percent', carbs: 50, fat: 30, protein: 30 })).toEqual({
      ok: false,
      error: expect.stringContaining('suman 110'),
    });
    expect(await updateMacros({ mode: 'percent', carbs: 70, fat: 10, protein: 20 })).toEqual({
      ok: false,
      error: expect.stringContaining('20 %'),
    });
    expect(await updateMacros({ mode: 'g_per_kg', proteinGPerKg: 5 })).toEqual({
      ok: false,
      error: expect.stringContaining('0,8 y 3'),
    });
    for (const bad of [
      null,
      {},
      { mode: 'otro' },
      { mode: 'percent', carbs: '50', fat: 30, protein: 20 },
      { mode: 'g_per_kg' },
      { mode: 'g_per_kg', proteinGPerKg: Number.NaN },
    ]) {
      expect(await updateMacros(bad), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
    expect(fake.rows('profiles')[0]).toMatchObject({ macro_split: null, protein_g_per_kg: null });
  });
  it('un cliente no puede colar otras columnas', async () => {
    const fake = setup();
    await updateMacros({ mode: 'default', kcal_adjustment: 999, user_id: OTHER });
    expect(fake.rows('profiles')[0]).toMatchObject({ user_id: ME, kcal_adjustment: 0 });
  });
  it('sin sesión, perfil ajeno o error de base: falla sin filtrar detalles', async () => {
    setup({ userId: null });
    expect(await updateMacros({ mode: 'default' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('sesión'),
    });
    setup({}, [{ user_id: OTHER, macro_split: null, protein_g_per_kg: null }]);
    expect(await updateMacros({ mode: 'default' })).toMatchObject({ ok: false });
    setup({ failWhen: (c) => (c.op === 'update' ? 'boom' : null) });
    expect(JSON.stringify(await updateMacros({ mode: 'default' }))).not.toContain('boom');
  });
});

describe('updateKcalAdjustment', () => {
  it('guarda el ajuste entero entre −1.000 y +1.000', async () => {
    const fake = setup();
    for (const value of [150, -300, 0, 1000, -1000]) {
      expect(await updateKcalAdjustment(value)).toEqual({ ok: true });
      expect(fake.rows('profiles')[0]).toMatchObject({ kcal_adjustment: value });
    }
  });
  it('rechaza fuera de rango, decimales y lo que no es número', async () => {
    const fake = setup();
    for (const bad of [1001, -1001, 50.5, '100', null, undefined, Number.NaN, Infinity]) {
      expect(await updateKcalAdjustment(bad), String(bad)).toMatchObject({ ok: false });
    }
    expect(fake.rows('profiles')[0]).toMatchObject({ kcal_adjustment: 0 });
  });
  it('no toca el perfil de otro usuario; sin sesión falla', async () => {
    const fake = setup({}, [{ user_id: OTHER, kcal_adjustment: 0 }]);
    expect(await updateKcalAdjustment(100)).toMatchObject({ ok: false });
    expect(fake.rows('profiles')[0]).toMatchObject({ kcal_adjustment: 0 });
    setup({ userId: null });
    expect(await updateKcalAdjustment(100)).toMatchObject({ ok: false });
  });
});
