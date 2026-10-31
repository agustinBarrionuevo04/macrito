// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanResponse } from '../types';

const h = vi.hoisted(() => ({
  addSuggestion: vi.fn(),
  requestPlan: vi.fn(),
  show: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../actions', () => ({ addSuggestion: h.addSuggestion }));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  requestPlan: h.requestPlan,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));

const { AssistantView } = await import('./assistant-view');
const { PlanApiError } = await import('../api');

beforeEach(() => Object.values(h).forEach((fn) => fn.mockReset()));
afterEach(cleanup);

const remaining = { kcal: 650, protein_g: 40, carbs_g: 70, fat_g: 20 };
const food = (id: string, name: string) => ({
  id,
  name,
  source: 'ar_seed' as const,
  per100g: { kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 1 },
  portions: [],
});
const response: PlanResponse = {
  status: 'ok',
  remaining,
  options: [
    {
      title: 'Pollo con arroz',
      meal: 'dinner',
      totals: { kcal: 520, protein_g: 45, carbs_g: 56, fat_g: 6 },
      items: [
        {
          food: food('f-pollo', 'Pechuga de pollo'),
          grams: 150,
          nutrition: { kcal: 247.5, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 },
        },
        {
          food: food('f-arroz', 'Arroz cocido'),
          grams: 200,
          nutrition: { kcal: 260, protein_g: 5.4, carbs_g: 56, fat_g: 0.6 },
        },
      ],
    },
    {
      title: 'Tortilla',
      meal: 'dinner',
      totals: { kcal: 400, protein_g: 30, carbs_g: 20, fat_g: 20 },
      items: [
        {
          food: food('f-huevo', 'Huevo'),
          grams: 200,
          nutrition: { kcal: 286, protein_g: 26, carbs_g: 2, fat_g: 20 },
        },
      ],
    },
  ],
};

const view = (over: Partial<Parameters<typeof AssistantView>[0]> = {}) =>
  render(
    <AssistantView
      day="2026-03-15"
      today="2026-03-15"
      initialMeal="dinner"
      initialRemaining={remaining}
      {...over}
    />,
  );

describe('AssistantView', () => {
  it('muestra lo que falta y la comida elegida; se puede cambiar', () => {
    view();
    expect(screen.getByText('650 kcal · P 40 g · C 70 g · G 20 g')).toBeTruthy();
    const dinner = screen.getByRole('button', { name: 'Cena' });
    expect(dinner.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Almuerzo' }));
    expect(screen.getByRole('button', { name: 'Almuerzo' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(dinner.getAttribute('aria-pressed')).toBe('false');
  });

  it('pide opciones con la comida, el modo y el día, y las muestra con sus totales', async () => {
    h.requestPlan.mockResolvedValue(response);
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Almuerzo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir opciones' }));
    await screen.findByText('Pollo con arroz');
    expect(h.requestPlan).toHaveBeenCalledWith(
      { mode: 'meal', meal: 'lunch', date: '2026-03-15' },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('150 g · 248 kcal')).toBeTruthy(); // 247,5 redondea a 248
    expect(screen.getByText('520 kcal · P 45 g · C 56 g · G 6 g')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Probar otras' })).toBeTruthy();
  });

  it('agregar manda solo ids y gramos de la opción, avisa y marca la opción como agregada', async () => {
    h.requestPlan.mockResolvedValue(response);
    h.addSuggestion.mockResolvedValue({ ok: true, count: 2 });
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir opciones' }));
    await screen.findByText('Pollo con arroz');
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar a cena' })[0]!);
    await waitFor(() =>
      expect(h.addSuggestion).toHaveBeenCalledWith('2026-03-15', {
        meal: 'dinner',
        items: [
          { foodId: 'f-pollo', grams: 150 },
          { foodId: 'f-arroz', grams: 200 },
        ],
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agregada' })).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Agregada' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const toast = h.show.mock.calls[0]![0];
    expect(toast).toMatchObject({ message: 'Agregado a cena', tone: 'success' });
    toast.action.onClick();
    expect(h.push).toHaveBeenCalledWith('/');
  });

  it('si no se pudo agregar muestra el error y deja reintentar', async () => {
    h.requestPlan.mockResolvedValue(response);
    h.addSuggestion.mockResolvedValue({
      ok: false,
      error: 'Alguno de los alimentos ya no está disponible.',
    });
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir opciones' }));
    await screen.findByText('Pollo con arroz');
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar a cena' })[0]!);
    expect((await screen.findByRole('alert')).textContent).toMatch(/ya no está disponible/);
    expect(screen.getAllByRole('button', { name: 'Agregar a cena' })).toHaveLength(2);
  });

  it('el error del servidor se muestra y no deja resultados', async () => {
    h.requestPlan.mockRejectedValue(
      new PlanApiError('quota_exceeded', 'Llegaste al límite de 100 análisis por día.'),
    );
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir opciones' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/límite de 100/);
    expect(screen.queryByRole('list', { name: '¿Qué como?' })).toBeNull();
  });

  it('si ya llegó a la meta lo dice', async () => {
    h.requestPlan.mockResolvedValue({
      status: 'reached',
      remaining: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    });
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir opciones' }));
    expect(await screen.findByText(/llegaste a tu meta de hoy/)).toBeTruthy();
  });

  it('armar el día: muestra la comida de cada opción y el total contra lo que falta', async () => {
    h.requestPlan.mockResolvedValue({
      ...response,
      options: [
        { ...response.options[0]!, meal: 'lunch' },
        { ...response.options[1]!, meal: 'dinner' },
      ],
    });
    h.addSuggestion.mockResolvedValue({ ok: true, count: 2 });
    view();
    fireEvent.click(screen.getByRole('tab', { name: 'Armar el día' }));
    expect(screen.queryByRole('group', { name: 'Comida' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir opciones' }));
    await screen.findByText('Pollo con arroz');
    expect(h.requestPlan.mock.calls[0]![0]).toMatchObject({ mode: 'day' });
    expect(screen.getByText('Almuerzo', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Total del plan: 920 kcal de las 650 que te faltan')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a almuerzo' }));
    await waitFor(() => expect(h.addSuggestion.mock.calls[0]![1].meal).toBe('lunch'));
  });

  it('en otro día vuelve al diario de ese día', async () => {
    h.requestPlan.mockResolvedValue(response);
    h.addSuggestion.mockResolvedValue({ ok: true, count: 1 });
    view({ day: '2026-03-14' });
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir opciones' }));
    await screen.findByText('Tortilla');
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar a cena' })[1]!);
    await waitFor(() => expect(h.show).toHaveBeenCalled());
    h.show.mock.calls[0]![0].action.onClick();
    expect(h.push).toHaveBeenCalledWith('/?date=2026-03-14');
  });
});
