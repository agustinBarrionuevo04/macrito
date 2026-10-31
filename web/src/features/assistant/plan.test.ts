import { describe, expect, it, vi } from 'vitest';
import type { DiaryEntry } from '@/features/diary/types';
import type { Food } from '@/types';
import { NoOptionsError, createPlan, type PlanDeps } from './plan';

const POLLO: Food = {
  id: 'f-pollo',
  source: 'ar_seed',
  name: 'Pechuga de pollo',
  per100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  portions: [],
};

const entry = (kcal: number): DiaryEntry => ({
  id: 'e1',
  mealType: 'lunch',
  foodId: null,
  name: 'Almuerzo',
  quantityG: 0,
  origin: 'manual',
  isEstimate: false,
  createdAt: '2026-03-15T12:00:00Z',
  kcal,
  protein_g: 40,
  carbs_g: 80,
  fat_g: 20,
});

const deps = (extra: Partial<PlanDeps> = {}): PlanDeps => ({
  targets: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
  entries: [entry(1200)],
  habitual: ['Pollo'],
  search: async () => [POLLO],
  ask: vi.fn().mockResolvedValue([
    {
      title: 'Pollo a la plancha',
      meal: 'dinner',
      items: [{ query: 'pechuga de pollo', grams: 200 }],
    },
  ]),
  ...extra,
});

describe('createPlan', () => {
  it('pide al modelo con lo que falta, resuelve con la base y devuelve las opciones', async () => {
    const d = deps();
    const result = await createPlan({ mode: 'meal', meal: 'dinner' }, d);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.remaining).toEqual({ kcal: 800, protein_g: 110, carbs_g: 120, fat_g: 40 });
    expect(result.options[0]!.totals.kcal).toBe(330);
    const message = vi.mocked(d.ask).mock.calls[0]![0];
    expect(message).toContain('800 kcal, 110 g de proteínas');
    expect(message).toContain('Comida: cena');
    expect(message).toContain('Pollo');
  });

  it('si ya llegó a la meta no gasta una consulta de IA', async () => {
    const d = deps({ entries: [entry(1900)] });
    const result = await createPlan({ mode: 'meal', meal: 'dinner' }, d);
    expect(result).toMatchObject({ status: 'reached' });
    expect(d.ask).not.toHaveBeenCalled();
  });

  it('en modo día arma las comidas libres', async () => {
    const d = deps();
    await createPlan({ mode: 'day', meal: 'dinner' }, d);
    expect(vi.mocked(d.ask).mock.calls[0]![0]).toContain(
      'breakfast (desayuno), snack (merienda), dinner (cena)',
    );
  });

  it('el modo día no se corta por "llegó a la meta"', async () => {
    const d = deps({ entries: [entry(1990)] });
    expect((await createPlan({ mode: 'day', meal: 'dinner' }, d)).status).toBe('ok');
  });

  it('si ninguna opción se puede resolver lanza NoOptionsError', async () => {
    const d = deps({ search: async () => [] });
    await expect(createPlan({ mode: 'meal', meal: 'dinner' }, d)).rejects.toBeInstanceOf(
      NoOptionsError,
    );
  });

  it('un error del modelo se propaga tal cual', async () => {
    const d = deps({ ask: vi.fn().mockRejectedValue(new Error('cupo')) });
    await expect(createPlan({ mode: 'meal', meal: 'dinner' }, d)).rejects.toThrow('cupo');
  });
});
