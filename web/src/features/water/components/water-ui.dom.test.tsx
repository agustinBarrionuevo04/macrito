// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  addWater: vi.fn(),
  undoLastWater: vi.fn(),
  setWaterGoal: vi.fn(),
  show: vi.fn(),
}));
vi.mock('../actions', () => ({
  addWater: h.addWater,
  undoLastWater: h.undoLastWater,
  setWaterGoal: h.setWaterGoal,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));

const { WaterCard } = await import('./water-card');
const { WaterGoalEditor } = await import('./water-goal-editor');

beforeEach(() => Object.values(h).forEach((fn) => fn.mockReset()));
afterEach(cleanup);

const card = (over: Partial<Parameters<typeof WaterCard>[0]> = {}) =>
  render(
    <WaterCard day="2026-03-15" totalMl={750} logs={2} goalMl={2800} custom={false} {...over} />,
  );

describe('WaterCard', () => {
  it('muestra el avance contra la meta, con su origen', () => {
    card();
    expect(screen.getByText('750 de 2.800 ml')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe(
      'Agua tomada: 750 de 2.800 ml',
    );
    expect(screen.getByText('Meta sugerida según tu peso')).toBeTruthy();
    cleanup();
    card({ custom: true });
    expect(screen.getByText('Meta definida por vos')).toBeTruthy();
  });

  it('al llegar a la meta lo dice y la barra no pasa del 100 %', () => {
    card({ totalMl: 3200 });
    expect(screen.getByText(/Llegaste a tu meta/)).toBeTruthy();
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe(
      '100%',
    );
  });

  it('las tomas rápidas suman al día', async () => {
    h.addWater.mockResolvedValue({ ok: true, id: 'x' });
    card();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar 330 ml' }));
    await waitFor(() => expect(h.addWater).toHaveBeenCalledWith('2026-03-15', 330));
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith({ message: '+330 ml', tone: 'success' }),
    );
  });

  it('otra cantidad: valida y manda el valor', async () => {
    h.addWater.mockResolvedValue({ ok: true, id: 'x' });
    card();
    fireEvent.click(screen.getByRole('button', { name: 'Otra cantidad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByRole('alert').textContent).toContain('entre 1 y 5.000 ml');
    expect(h.addWater).not.toHaveBeenCalled();
    const input = screen.getByLabelText('Cantidad');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '425' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(h.addWater).toHaveBeenCalledWith('2026-03-15', 425));
  });

  it('una cantidad enorme no se manda', () => {
    card();
    fireEvent.click(screen.getByRole('button', { name: 'Otra cantidad' }));
    const input = screen.getByLabelText('Cantidad');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(h.addWater).not.toHaveBeenCalled();
  });

  it('deshacer solo aparece si hay tomas y borra la última', async () => {
    h.undoLastWater.mockResolvedValue({ ok: true, ml: 500 });
    card();
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer la última toma' }));
    await waitFor(() => expect(h.undoLastWater).toHaveBeenCalledWith('2026-03-15'));
    cleanup();
    card({ logs: 0, totalMl: 0 });
    expect(screen.queryByRole('button', { name: 'Deshacer la última toma' })).toBeNull();
  });

  it('un error del servidor se muestra y no se avisa éxito', async () => {
    h.addWater.mockResolvedValue({ ok: false, error: 'No pudimos guardar. Probá de nuevo.' });
    card();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar 200 ml' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('No pudimos guardar. Probá de nuevo.'),
    );
    expect(h.show).not.toHaveBeenCalled();
  });
});

describe('WaterGoalEditor', () => {
  it('sin meta propia muestra la sugerida y no ofrece volver a ella', () => {
    render(<WaterGoalEditor saved={null} suggestedMl={2800} />);
    expect((screen.getByLabelText('Meta diaria') as HTMLInputElement).value).toBe('2.800');
    expect(
      (screen.getByRole('button', { name: 'Usar la sugerida (2.800 ml)' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('guarda una meta propia', async () => {
    h.setWaterGoal.mockResolvedValue({ ok: true });
    render(<WaterGoalEditor saved={null} suggestedMl={2800} />);
    const input = screen.getByLabelText('Meta diaria');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '3200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));
    await waitFor(() => expect(h.setWaterGoal).toHaveBeenCalledWith(3200));
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith({ message: 'Meta guardada', tone: 'success' }),
    );
  });

  it('vuelve a la sugerida mandando null', async () => {
    h.setWaterGoal.mockResolvedValue({ ok: true });
    render(<WaterGoalEditor saved={3000} suggestedMl={2800} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar la sugerida (2.800 ml)' }));
    await waitFor(() => expect(h.setWaterGoal).toHaveBeenCalledWith(null));
  });

  it('una meta fuera de rango no se manda', () => {
    render(<WaterGoalEditor saved={null} suggestedMl={2800} />);
    const input = screen.getByLabelText('Meta diaria');
    fireEvent.focus(input);
    for (const value of ['100', '20000', '']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));
      expect(screen.getByRole('alert').textContent).toContain('entre 500 y 10.000 ml');
    }
    expect(h.setWaterGoal).not.toHaveBeenCalled();
  });
});
