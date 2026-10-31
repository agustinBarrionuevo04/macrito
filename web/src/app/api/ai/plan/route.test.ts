import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError } from '@/lib/ai/types';
import { QuotaExceededError } from '@/lib/ai/service';
import type { Food } from '@/types';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  getCurrentProfile: vi.fn(),
  getDayEntries: vi.fn(),
  getHabitualFoods: vi.fn(),
  structured: vi.fn(),
  search: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { timezone: 'America/Argentina/Cordoba' } }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/features/profile/server', () => ({ getCurrentProfile: h.getCurrentProfile }));
vi.mock('@/features/diary/server', () => ({ getDayEntries: h.getDayEntries }));
vi.mock('@/features/assistant/server', () => ({
  getHabitualFoods: h.getHabitualFoods,
  createLocalSearch: async () => h.search,
}));
vi.mock('@/lib/ai/server', () => ({ getAiService: () => ({ structured: h.structured }) }));

const { POST } = await import('./route');

const PROFILE = {
  sex: 'male',
  birthDate: '2001-03-15',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'sedentary',
  goal: 'lose',
  weeklyGoalKg: -0.5,
  kcalAdjustment: 0,
  timezone: 'America/Argentina/Cordoba',
};

const POLLO: Food = {
  id: 'f-pollo',
  source: 'ar_seed',
  name: 'Pechuga de pollo',
  per100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  portions: [],
};

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/ai/plan', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  h.getCurrentProfile.mockResolvedValue({ userId: 'user-1', profile: PROFILE });
  h.getDayEntries.mockResolvedValue([]);
  h.getHabitualFoods.mockResolvedValue(['Pollo']);
  h.search.mockResolvedValue([POLLO]);
  h.structured.mockImplementation(async (_u, _d, req) =>
    req.parse({
      options: [
        { title: 'Pollo', meal: 'dinner', items: [{ query: 'pechuga de pollo', grams: 150 }] },
      ],
    }),
  );
});

describe('POST /api/ai/plan', () => {
  it('sin sesión responde 401 y no gasta nada', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(request({ mode: 'meal' }));
    expect(response.status).toBe(401);
    expect(h.structured).not.toHaveBeenCalled();
  });

  it('devuelve opciones con la nutrición de la base y lo que falta', async () => {
    const response = await POST(request({ mode: 'meal', meal: 'dinner' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.options[0].totals.kcal).toBe(247.5);
    expect(body.remaining.kcal).toBeGreaterThan(1500);
    // El cupo se descuenta del "hoy" del usuario y es el de texto (lo decide el servicio).
    expect(h.structured).toHaveBeenCalledWith(
      'user-1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.objectContaining({ system: expect.stringContaining('suggest_meals') }),
      expect.anything(),
    );
  });

  it('usa "dinner" si no se indica la comida', async () => {
    await POST(request({ mode: 'meal' }));
    expect(h.structured.mock.calls[0]![2].text).toContain('Comida: cena');
  });

  it('valida el pedido: modo, comida y fecha', async () => {
    for (const body of [
      'no es json',
      {},
      { mode: 'semana' },
      { mode: 'meal', meal: 'brunch' },
      { mode: 'meal', date: '2026-02-30' },
      { mode: 'meal', date: 'hoy' },
    ]) {
      const response = await POST(request(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(h.structured).not.toHaveBeenCalled();
  });

  it('con el perfil incompleto responde 400', async () => {
    h.getCurrentProfile.mockResolvedValue({ userId: 'user-1', profile: null });
    expect((await POST(request({ mode: 'meal' }))).status).toBe(400);
  });

  it('si ya llegó a la meta responde "reached" sin llamar a la IA', async () => {
    h.getDayEntries.mockResolvedValue([
      {
        id: 'e',
        mealType: 'lunch',
        foodId: null,
        name: 'x',
        quantityG: 0,
        origin: 'manual',
        isEstimate: false,
        createdAt: '',
        kcal: 5000,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
      },
    ]);
    const body = await (await POST(request({ mode: 'meal' }))).json();
    expect(body.status).toBe('reached');
    expect(h.structured).not.toHaveBeenCalled();
  });

  it('el cupo agotado responde 429 con el límite', async () => {
    h.structured.mockRejectedValue(new QuotaExceededError('text', 100));
    const response = await POST(request({ mode: 'meal' }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'quota_exceeded', limit: 100 });
  });

  it('una respuesta que no se puede usar o un proveedor caído no filtran detalles', async () => {
    h.structured.mockRejectedValue(new AiError('unavailable', 'HTTP 500 (clave sk-secreta)'));
    const response = await POST(request({ mode: 'meal' }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/sk-secreta/);
  });

  it('si ninguna opción está en la base responde 422 no_options', async () => {
    h.search.mockResolvedValue([]);
    const response = await POST(request({ mode: 'meal' }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'no_options' });
  });

  it('un fallo al leer el diario responde 500', async () => {
    h.getDayEntries.mockResolvedValue(null);
    expect((await POST(request({ mode: 'meal' }))).status).toBe(500);
  });
});
