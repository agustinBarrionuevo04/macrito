// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@/types';

const h = vi.hoisted(() => ({ createCustomFood: vi.fn(), updateCustomFood: vi.fn() }));
vi.mock('../actions', () => ({
  createCustomFood: h.createCustomFood,
  updateCustomFood: h.updateCustomFood,
}));

const { CustomFoodForm, emptyValues, valuesFromFood } = await import('./custom-food-form');

const saved: Food = {
  id: 'new',
  source: 'custom',
  name: 'Mi pan',
  per100g: { kcal: 250, protein_g: 8, carbs_g: 50, fat_g: 2 },
  portions: [],
};

const dlg = () => within(document.querySelector('dialog[open]') as HTMLElement);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  h.createCustomFood.mockReset();
  h.updateCustomFood.mockReset();
});
afterEach(cleanup);

const num = (label: string | RegExp, value: string) => {
  const input = dlg().getByLabelText(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const text = (label: string | RegExp, value: string) =>
  fireEvent.change(dlg().getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(dlg().getByRole('button', { name: 'Guardar y elegir' }));

const fillRequired = () => {
  text('Nombre', 'Mi pan');
  num('Calorías', '250');
  num('Proteínas', '8');
  num('Carbohidratos', '50');
  num('Grasas', '2');
};

describe('CustomFoodForm', () => {
  it('crea un alimento y lo devuelve guardado, con coma decimal', async () => {
    h.createCustomFood.mockResolvedValue({ ok: true, food: saved });
    const onSaved = vi.fn();
    render(
      <CustomFoodForm
        mode={{ kind: 'create', values: emptyValues() }}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    text('Nombre', 'Mi pan');
    num('Calorías', '250,5');
    num('Proteínas', '8');
    num('Carbohidratos', '50');
    num('Grasas', '2');
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(h.createCustomFood).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mi pan',
        kcal: 250.5,
        protein_g: 8,
        carbs_g: 50,
        fat_g: 2,
        portions: [],
      }),
    );
  });

  it('valida en el cliente y no llama al servidor con datos inválidos', () => {
    render(
      <CustomFoodForm
        mode={{ kind: 'create', values: emptyValues() }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    save();
    expect(dlg().getByRole('alert').textContent).toContain('nombre');
    text('Nombre', 'x');
    save();
    expect(dlg().getByRole('alert').textContent).toContain('calorías');
    num('Calorías', '1000');
    save();
    expect(dlg().getByRole('alert').textContent).toContain('calorías');
    num('Calorías', '300');
    num('Proteínas', '60');
    num('Carbohidratos', '60');
    num('Grasas', '60');
    save();
    expect(dlg().getByRole('alert').textContent).toContain('suman más de 100');
    expect(h.createCustomFood).not.toHaveBeenCalled();
  });

  it('agrega, completa y quita porciones; una porción sin gramos no pasa', async () => {
    h.createCustomFood.mockResolvedValue({ ok: true, food: saved });
    render(
      <CustomFoodForm
        mode={{ kind: 'create', values: emptyValues() }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fillRequired();
    fireEvent.click(dlg().getByRole('button', { name: 'Agregar porción' }));
    text('Descripción', '1 rebanada');
    save();
    expect(dlg().getByRole('alert').textContent).toContain('gramos');
    num('Gramos', '30');
    save();
    await waitFor(() =>
      expect(h.createCustomFood).toHaveBeenCalledWith(
        expect.objectContaining({ portions: [{ label: '1 rebanada', grams: 30 }] }),
      ),
    );
    fireEvent.click(dlg().getByRole('button', { name: 'Quitar porción 1 rebanada' }));
    expect(dlg().queryByLabelText('Descripción')).toBeNull();
  });

  it('mostrar el error del servidor y no cerrar', async () => {
    h.createCustomFood.mockResolvedValue({ ok: false, error: 'No pudimos guardar el alimento.' });
    const onSaved = vi.fn();
    render(
      <CustomFoodForm
        mode={{ kind: 'create', values: emptyValues() }}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    fillRequired();
    save();
    await waitFor(() =>
      expect(dlg().getByRole('alert').textContent).toBe('No pudimos guardar el alimento.'),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('corregir precarga el alimento del catálogo y crea una copia nueva', async () => {
    h.createCustomFood.mockResolvedValue({ ok: true, food: saved });
    const original: Food = {
      id: 'off1',
      source: 'off',
      name: 'Galletitas',
      brand: 'Marca',
      barcode: '7790001000019',
      per100g: { kcal: 480, protein_g: 6, carbs_g: 70, fat_g: 20, sodium_mg: 400 },
      portions: [{ label: '1 paquete', grams: 40 }],
    };
    render(
      <CustomFoodForm
        mode={{ kind: 'correct', values: valuesFromFood(original) }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect((dlg().getByLabelText('Nombre') as HTMLInputElement).value).toBe('Galletitas');
    expect(dlg().getByText(/El alimento original no cambia/)).toBeTruthy();
    num('Calorías', '450');
    save();
    await waitFor(() => expect(h.createCustomFood).toHaveBeenCalledTimes(1));
    expect(h.createCustomFood).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Galletitas',
        brand: 'Marca',
        barcode: '7790001000019',
        kcal: 450,
        sodium_mg: 400,
        portions: [{ label: '1 paquete', grams: 40 }],
      }),
    );
    expect(h.updateCustomFood).not.toHaveBeenCalled();
  });

  it('editar actualiza por id en vez de crear', async () => {
    h.updateCustomFood.mockResolvedValue({ ok: true, food: saved });
    const mine: Food = { ...saved, id: 'mine1' };
    const onSaved = vi.fn();
    render(
      <CustomFoodForm
        mode={{ kind: 'edit', foodId: 'mine1', values: valuesFromFood(mine) }}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    text('Nombre', 'Mi pan integral');
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(h.updateCustomFood).toHaveBeenCalledWith(
      'mine1',
      expect.objectContaining({ name: 'Mi pan integral' }),
    );
    expect(h.createCustomFood).not.toHaveBeenCalled();
  });

  it('cerrado no muestra nada', () => {
    render(<CustomFoodForm mode={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});
