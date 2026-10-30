// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@/types';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  show: vi.fn(),
  addEntry: vi.fn(),
  setFavorite: vi.fn(),
  searchFoods: vi.fn(),
  lookupBarcode: vi.fn(),
  createCustomFood: vi.fn(),
  updateCustomFood: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));
vi.mock('@/features/diary/actions', () => ({ addEntry: h.addEntry }));
vi.mock('../actions', () => ({
  setFavorite: h.setFavorite,
  createCustomFood: h.createCustomFood,
  updateCustomFood: h.updateCustomFood,
}));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, searchFoods: h.searchFoods, lookupBarcode: h.lookupBarcode };
});

const { AddFoodView } = await import('./add-food-view');

const milk: Food = {
  id: 'm1',
  source: 'off',
  name: 'Leche entera',
  per100g: { kcal: 60, protein_g: 3, carbs_g: 5, fat_g: 3 },
  portions: [],
};
const VALID = '7790001000019';

const view = (over: Partial<Parameters<typeof AddFoodView>[0]> = {}) =>
  render(
    <AddFoodView
      day="2026-03-15"
      today="2026-03-15"
      initialMeal="snack"
      favoriteIds={[]}
      favorites={[]}
      recents={[]}
      {...over}
    />,
  );

const dlg = () => within(document.querySelector('dialog[open]') as HTMLElement);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  Object.values(h).forEach((fn) => fn.mockReset());
});
afterEach(cleanup);

describe('AddFoodView', () => {
  it('buscar → elegir → ajustar → agregar: llama a addEntry con el día y avisa con "Ver diario"', async () => {
    h.searchFoods.mockResolvedValue({ foods: [milk], degraded: false });
    h.addEntry.mockResolvedValue({ ok: true, id: 'e1' });
    view({ day: '2026-03-10' });

    fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: 'leche' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir Leche entera' }));

    const amount = dlg().getByLabelText('Cantidad');
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: '250' } });
    expect((dlg().getByLabelText('Comida') as HTMLSelectElement).value).toBe('snack');
    fireEvent.click(dlg().getByRole('button', { name: 'Agregar al diario' }));

    await waitFor(() => expect(h.addEntry).toHaveBeenCalledTimes(1));
    expect(h.addEntry).toHaveBeenCalledWith(
      { food: milk, quantity_g: 250, meal_type: 'snack', origin: 'search', is_estimate: false },
      '2026-03-10',
    );
    await waitFor(() => expect(h.show).toHaveBeenCalled());
    const toast = h.show.mock.calls[0]![0] as { message: string; action: { onClick: () => void } };
    expect(toast.message).toBe('Agregado a merienda');
    toast.action.onClick();
    expect(h.push).toHaveBeenCalledWith('/?date=2026-03-10');
  });

  it('"Ver diario" de hoy va a la raíz', async () => {
    h.searchFoods.mockResolvedValue({ foods: [milk], degraded: false });
    h.addEntry.mockResolvedValue({ ok: true, id: 'e1' });
    view();
    fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: 'leche' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir Leche entera' }));
    fireEvent.click(dlg().getByRole('button', { name: 'Agregar al diario' }));
    await waitFor(() => expect(h.show).toHaveBeenCalled());
    (h.show.mock.calls[0]![0] as { action: { onClick: () => void } }).action.onClick();
    expect(h.push).toHaveBeenCalledWith('/');
  });

  it('si addEntry falla no avisa éxito y muestra el error', async () => {
    h.searchFoods.mockResolvedValue({ foods: [milk], degraded: false });
    h.addEntry.mockResolvedValue({ ok: false, error: 'No pudimos guardar el cambio.' });
    view();
    fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: 'leche' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir Leche entera' }));
    fireEvent.click(dlg().getByRole('button', { name: 'Agregar al diario' }));
    await waitFor(() =>
      expect(dlg().getByRole('alert').textContent).toBe('No pudimos guardar el cambio.'),
    );
    expect(h.show).not.toHaveBeenCalled();
  });

  it('sin comida en la URL sugiere una según la hora (no queda vacía)', () => {
    view({ initialMeal: null, recents: [milk] });
    fireEvent.click(screen.getByRole('button', { name: 'Elegir Leche entera' }));
    expect((dlg().getByLabelText('Comida') as HTMLSelectElement).value).toMatch(
      /^(breakfast|lunch|snack|dinner)$/,
    );
  });

  describe('favoritos', () => {
    it('marcar un favorito lo suma a la lista y llama al servidor', async () => {
      h.setFavorite.mockResolvedValue({ ok: true });
      view({ recents: [milk] });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar Leche entera a favoritos' }));
      await waitFor(() => expect(h.setFavorite).toHaveBeenCalledWith('m1', true));
      const favorites = screen.getByRole('region', { name: 'Favoritos' });
      expect(within(favorites).getByText('Leche entera')).toBeTruthy();
      expect(screen.queryByRole('region', { name: 'Recientes' })).toBeNull();
    });

    it('si el servidor falla, revierte y avisa', async () => {
      h.setFavorite.mockResolvedValue({ ok: false, error: 'x' });
      view({ recents: [milk] });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar Leche entera a favoritos' }));
      await waitFor(() =>
        expect(h.show).toHaveBeenCalledWith({
          message: 'No pudimos actualizar tus favoritos.',
          tone: 'error',
        }),
      );
      expect(screen.queryByRole('region', { name: 'Favoritos' })).toBeNull();
      expect(
        screen
          .getByRole('button', { name: 'Agregar Leche entera a favoritos' })
          .getAttribute('aria-pressed'),
      ).toBe('false');
    });

    it('desmarcar un favorito lo saca de la lista', async () => {
      h.setFavorite.mockResolvedValue({ ok: true });
      view({ favoriteIds: ['m1'], favorites: [milk] });
      fireEvent.click(screen.getByRole('button', { name: 'Quitar Leche entera de favoritos' }));
      await waitFor(() => expect(h.setFavorite).toHaveBeenCalledWith('m1', false));
      expect(screen.queryByRole('region', { name: 'Favoritos' })).toBeNull();
    });
  });

  describe('escaneo', () => {
    const toScan = () => fireEvent.click(screen.getByRole('tab', { name: 'Escanear' }));
    const enterCode = (code: string) => {
      fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: code } });
      fireEvent.click(screen.getByRole('button', { name: 'Buscar código' }));
    };

    it('un código encontrado abre la elección de cantidad con origen "barcode"', async () => {
      h.lookupBarcode.mockResolvedValue(milk);
      h.addEntry.mockResolvedValue({ ok: true, id: 'e' });
      view();
      toScan();
      enterCode(VALID);
      await waitFor(() => expect(h.lookupBarcode).toHaveBeenCalledWith(VALID, expect.anything()));
      await waitFor(() => expect(document.querySelector('dialog[open]')).not.toBeNull());
      fireEvent.click(dlg().getByRole('button', { name: 'Agregar al diario' }));
      await waitFor(() =>
        expect(h.addEntry).toHaveBeenCalledWith(
          expect.objectContaining({ origin: 'barcode' }),
          '2026-03-15',
        ),
      );
    });

    it('un producto desconocido ofrece crearlo con ese código', async () => {
      h.lookupBarcode.mockResolvedValue(null);
      view();
      toScan();
      enterCode(VALID);
      expect(await screen.findByText('No encontramos ese producto.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Crear alimento con este código' }));
      expect((dlg().getByLabelText(/Código de barras/) as HTMLInputElement).value).toBe(VALID);
    });

    it('un error de red muestra el mensaje', async () => {
      const { FoodsApiError } = await import('../api');
      h.lookupBarcode.mockRejectedValue(new FoodsApiError('rate_limited', 'Esperá un momento.'));
      view();
      toScan();
      enterCode(VALID);
      expect((await screen.findByText('Esperá un momento.')).getAttribute('role')).toBe('alert');
    });
  });

  describe('alimento propio', () => {
    it('crear desde el buscador (sin resultados) precarga el nombre y sigue a la cantidad con origen "manual"', async () => {
      h.searchFoods.mockResolvedValue({ foods: [], degraded: false });
      const mine: Food = { ...milk, id: 'c1', source: 'custom', name: 'Mi flan' };
      h.createCustomFood.mockResolvedValue({ ok: true, food: mine });
      h.addEntry.mockResolvedValue({ ok: true, id: 'e' });
      view();
      fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: 'mi flan' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Crear "mi flan"' }));
      expect((dlg().getByLabelText('Nombre') as HTMLInputElement).value).toBe('mi flan');

      const num = (label: string, value: string) => {
        const input = dlg().getByLabelText(label);
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value } });
        fireEvent.blur(input);
      };
      num('Calorías', '120');
      num('Proteínas', '3');
      num('Carbohidratos', '20');
      num('Grasas', '3');
      fireEvent.click(dlg().getByRole('button', { name: 'Guardar y elegir' }));

      await waitFor(() =>
        expect(dlg().getByRole('button', { name: 'Agregar al diario' })).toBeTruthy(),
      );
      fireEvent.click(dlg().getByRole('button', { name: 'Agregar al diario' }));
      await waitFor(() =>
        expect(h.addEntry).toHaveBeenCalledWith(
          expect.objectContaining({ food: mine, origin: 'manual' }),
          '2026-03-15',
        ),
      );
    });

    it('corregir un alimento del catálogo abre el formulario precargado', () => {
      view({ recents: [milk] });
      fireEvent.click(screen.getByRole('button', { name: 'Elegir Leche entera' }));
      fireEvent.click(dlg().getByRole('button', { name: 'Corregir y guardar como propio' }));
      expect((dlg().getByLabelText('Nombre') as HTMLInputElement).value).toBe('Leche entera');
      expect(dlg().getByText(/El alimento original no cambia/)).toBeTruthy();
    });
  });

  it('las pestañas cambian de panel', () => {
    view();
    expect(screen.getByRole('tab', { name: 'Buscar' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Mi alimento' }));
    expect(screen.getByRole('button', { name: 'Alimento propio' })).toBeTruthy();
    expect(screen.queryByLabelText('Buscar alimento')).toBeNull();
  });
});
