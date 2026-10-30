// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@/types';

const { PortionSheet } = await import('./portion-sheet');

const bread: Food = {
  id: 'b1',
  source: 'off',
  name: 'Pan lactal',
  per100g: { kcal: 250, protein_g: 8, carbs_g: 50, fat_g: 2 },
  portions: [{ label: '1 rebanada', grams: 30 }],
};
const plain: Food = { ...bread, id: 'p1', name: 'Arroz', portions: [] };

const setup = (food: Food | null, over: Record<string, unknown> = {}) => {
  const p = {
    onClose: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue({ ok: true }),
    onEdit: vi.fn(),
    onCorrect: vi.fn(),
    ...over,
  };
  render(<PortionSheet food={food} origin="search" defaultMeal="lunch" {...p} />);
  return p;
};

const dlg = () => within(document.querySelector('dialog[open]') as HTMLElement);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

const amount = (value: string) => {
  const input = dlg().getByLabelText('Cantidad');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
};

describe('PortionSheet', () => {
  it('con porciones arranca en 1 porción y muestra los gramos y la nutrición', () => {
    setup(bread);
    expect((dlg().getByLabelText('Unidad') as HTMLSelectElement).value).toBe('0');
    expect(dlg().getByText('= 30 g')).toBeTruthy();
    expect(dlg().getByText('75')).toBeTruthy(); // 250 kcal/100 g × 30 g
  });

  it('sin porciones arranca en 100 g', () => {
    setup(plain);
    expect((dlg().getByLabelText('Unidad') as HTMLSelectElement).value).toBe('g');
    expect((dlg().getByLabelText('Cantidad') as HTMLInputElement).value).toBe('100');
    expect(dlg().getByText('250')).toBeTruthy();
  });

  it('la vista previa sigue a la cantidad, con coma decimal', () => {
    setup(bread);
    amount('2,5');
    expect(dlg().getByText('= 75 g')).toBeTruthy();
    expect(dlg().getByText('188')).toBeTruthy(); // 187,5 redondeado
  });

  it('al cambiar a gramos la cantidad se reinicia a 100', () => {
    setup(bread);
    amount('3');
    fireEvent.blur(dlg().getByLabelText('Cantidad')); // en el celular, tocar el selector saca el foco del campo
    fireEvent.change(dlg().getByLabelText('Unidad'), { target: { value: 'g' } });
    expect((dlg().getByLabelText('Cantidad') as HTMLInputElement).value).toBe('100');
    expect(dlg().queryByText(/^= /)).toBeNull();
  });

  it('confirma con el borrador del contrato (gramos totales, comida y origen)', async () => {
    const p = setup(bread);
    amount('2');
    fireEvent.change(dlg().getByLabelText('Comida'), { target: { value: 'dinner' } });
    fireEvent.click(dlg().getByRole('button', { name: 'Agregar al diario' }));
    await waitFor(() => expect(p.onConfirm).toHaveBeenCalledTimes(1));
    expect(p.onConfirm).toHaveBeenCalledWith({
      food: bread,
      quantity_g: 60,
      meal_type: 'dinner',
      origin: 'search',
      is_estimate: false,
    });
    await waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it('una cantidad inválida muestra el error y no confirma', () => {
    const p = setup(plain);
    for (const bad of ['0', '', '10001']) {
      amount(bad);
      fireEvent.click(dlg().getByRole('button', { name: 'Agregar al diario' }));
      expect(dlg().getByRole('alert').textContent).toContain('cantidad');
    }
    expect(p.onConfirm).not.toHaveBeenCalled();
  });

  it('si el servidor falla muestra el error y la hoja sigue abierta', async () => {
    const p = setup(plain, {
      onConfirm: vi.fn().mockResolvedValue({ ok: false, error: 'No pudimos guardar.' }),
    });
    fireEvent.click(dlg().getByRole('button', { name: 'Agregar al diario' }));
    await waitFor(() => expect(dlg().getByRole('alert').textContent).toBe('No pudimos guardar.'));
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('un alimento del catálogo se corrige; uno propio se edita', () => {
    const p = setup(bread);
    fireEvent.click(dlg().getByRole('button', { name: 'Corregir y guardar como propio' }));
    expect(p.onCorrect).toHaveBeenCalledWith(bread);
    expect(p.onEdit).not.toHaveBeenCalled();
    cleanup();
    const mine = { ...plain, source: 'custom' as const };
    const q = setup(mine);
    fireEvent.click(dlg().getByRole('button', { name: 'Editar alimento' }));
    expect(q.onEdit).toHaveBeenCalledWith(mine);
    expect(q.onCorrect).not.toHaveBeenCalled();
  });

  it('cerrada no muestra nada', () => {
    setup(null);
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});
