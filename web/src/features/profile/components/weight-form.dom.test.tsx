// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ logWeight: vi.fn(), show: vi.fn() }));
vi.mock('../actions', () => ({ logWeight: h.logWeight }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));

const { WeightForm } = await import('./weight-form');

beforeEach(() => {
  h.logWeight.mockReset();
  h.show.mockReset();
});
afterEach(cleanup);

const field = () => screen.getByLabelText('Peso de hoy') as HTMLInputElement;
const type = (text: string) => {
  fireEvent.focus(field());
  fireEvent.change(field(), { target: { value: text } });
};
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

describe('WeightForm', () => {
  it('precarga el peso actual', () => {
    render(<WeightForm currentWeightKg={80} />);
    expect(field().value).toBe('80');
  });

  it('REGRESIÓN: un peso fuera de rango muestra el error y NO se guarda (antes se guardaba 25 kg)', () => {
    render(<WeightForm currentWeightKg={80} />);
    type('10');
    save();
    expect(screen.getByRole('alert').textContent).toBe('Ingresá un peso entre 25 y 400 kg.');
    expect(h.logWeight).not.toHaveBeenCalled();
  });

  it('un campo vacío tampoco se guarda', () => {
    render(<WeightForm currentWeightKg={80} />);
    type('');
    save();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(h.logWeight).not.toHaveBeenCalled();
  });

  it('guarda un peso válido con coma decimal y avisa con un toast', async () => {
    h.logWeight.mockResolvedValue({ ok: true });
    render(<WeightForm currentWeightKg={80} />);
    type('79,5');
    save();
    await waitFor(() => expect(h.logWeight).toHaveBeenCalledWith({ weightKg: 79.5 }));
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith({ message: 'Peso registrado', tone: 'success' }),
    );
  });

  it('si el servidor rechaza, muestra su mensaje y no avisa éxito', async () => {
    h.logWeight.mockResolvedValue({
      ok: false,
      error: 'No pudimos guardar los datos. Probá de nuevo.',
    });
    render(<WeightForm currentWeightKg={80} />);
    type('79');
    save();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('No pudimos guardar'),
    );
    expect(h.show).not.toHaveBeenCalled();
  });
});
