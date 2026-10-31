// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types';

const h = vi.hoisted(() => ({
  updateMacros: vi.fn(),
  updateKcalAdjustment: vi.fn(),
  show: vi.fn(),
}));
vi.mock('../actions', () => ({
  updateMacros: h.updateMacros,
  updateKcalAdjustment: h.updateKcalAdjustment,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));

const { MicroPanel } = await import('./micro-panel');
const { MacroEditor } = await import('./macro-editor');
const { KcalAdjustmentEditor } = await import('./kcal-adjustment-editor');

const TODAY = '2026-03-15';
const profile: UserProfile = {
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

beforeEach(() => Object.values(h).forEach((fn) => fn.mockReset()));
afterEach(cleanup);

describe('MicroPanel', () => {
  const totals = { fiber_g: 18.4, sugar_g: 61.2, sodium_mg: 2300, entries: 4, withData: 2 };

  it('muestra cada valor contra su referencia (meta de fibra, máximos de azúcares y sodio)', () => {
    render(<MicroPanel totals={totals} targetKcal={2000} />);
    expect(screen.getByText('18,4 / 28 g')).toBeTruthy();
    expect(screen.getByText('61,2 / 50 g')).toBeTruthy();
    expect(screen.getByText('2.300 / 2.000 mg')).toBeTruthy();
    expect(screen.getByText('(meta)')).toBeTruthy();
    expect(screen.getAllByText('(máximo)')).toHaveLength(2);
  });

  it('pasarse de un máximo se avisa en texto (no solo en color); llegar a la meta de fibra también', () => {
    render(<MicroPanel totals={{ ...totals, fiber_g: 30 }} targetKcal={2000} />);
    expect(screen.getAllByText('Superaste el máximo')).toHaveLength(2);
    expect(screen.getByText('Llegaste a la meta')).toBeTruthy();
    const sodium = screen.getByRole('progressbar', { name: 'Sodio' });
    expect(sodium.getAttribute('aria-valuetext')).toContain('Superaste el máximo');
  });

  it('pasarse de la fibra no es un problema', () => {
    render(
      <MicroPanel
        totals={{ ...totals, fiber_g: 80, sugar_g: 0, sodium_mg: 0 }}
        targetKcal={2000}
      />,
    );
    expect(screen.queryByText('Superaste el máximo')).toBeNull();
  });

  it('dice cuán completo es el dato', () => {
    const { rerender } = render(<MicroPanel totals={totals} targetKcal={2000} />);
    expect(screen.getByText(/Calculado con 2 de 4 entradas/)).toBeTruthy();
    rerender(<MicroPanel totals={{ ...totals, withData: 4 }} targetKcal={2000} />);
    expect(screen.getByText('Calculado con todas las entradas del día.')).toBeTruthy();
    rerender(<MicroPanel totals={{ ...totals, entries: 0, withData: 0 }} targetKcal={2000} />);
    expect(screen.getByText('Todavía no hay registros para calcular.')).toBeTruthy();
  });

  it('sin meta de calorías no inventa referencias', () => {
    render(<MicroPanel totals={totals} targetKcal={null} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Completá tu perfil para ver las referencias.')).toBeTruthy();
  });

  it('explica de dónde salen las referencias', () => {
    render(<MicroPanel totals={totals} targetKcal={2000} />);
    expect(screen.getByText(/14 g por cada 1.000 kcal/)).toBeTruthy();
    expect(screen.getByText(/solo orientativo/)).toBeTruthy();
  });
});

describe('MacroEditor', () => {
  const setup = (p: UserProfile = profile) => render(<MacroEditor profile={p} today={TODAY} />);
  const field = (label: string, value: string) => {
    const input = screen.getByLabelText(label);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  };

  it('arranca en el modo del perfil', () => {
    setup({ ...profile, macroSplit: { carbs: 0.5, fat: 0.3, protein: 0.2 } });
    expect((screen.getByRole('radio', { name: 'Porcentajes' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText('Carbohidratos') as HTMLInputElement).value).toBe('50');
    cleanup();
    setup({ ...profile, proteinGPerKg: 2 });
    expect(
      (screen.getByRole('radio', { name: 'Proteína por kilo' }) as HTMLInputElement).checked,
    ).toBe(true);
    cleanup();
    setup();
    expect((screen.getByRole('radio', { name: 'Por defecto' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('en porcentajes muestra la suma y la vista previa en gramos (2.112 kcal: 20 % de proteína = 106 g)', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Porcentajes' }));
    const preview = screen.getByRole('region', { name: 'Así quedaría tu meta' });
    expect(
      within(preview).getByText(
        /2\.112 kcal · Proteínas 106 g · Carbohidratos 264 g · Grasas 70 g/,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Suma 100 %')).toBeTruthy();
  });

  it('una suma distinta de 100 se avisa, saca la vista previa y bloquea guardar', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Porcentajes' }));
    field('Proteínas', '30');
    expect(screen.getByText('Suma 110 %')).toBeTruthy();
    expect(screen.getByText(/tienen que sumar 100 \(ahora suman 110\)/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Así quedaría tu meta' })).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Guardar reparto' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('grasas por debajo del 20 % se rechazan', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Porcentajes' }));
    field('Grasas', '10');
    field('Carbohidratos', '70');
    expect(screen.getByText(/no pueden ser menos del 20 %/)).toBeTruthy();
  });

  it('en g por kilo: 2 g × 80 kg = 160 g de proteína, y fuera de rango se rechaza', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Proteína por kilo' }));
    field('Proteína', '2');
    expect(
      within(screen.getByRole('region', { name: 'Así quedaría tu meta' })).getAllByText(
        /Proteínas 160 g/,
      ).length,
    ).toBeGreaterThan(0);
    field('Proteína', '5');
    expect(screen.getByText(/entre 0,8 y 3 g por kilo/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Guardar reparto' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('guarda porcentajes y avisa con un toast', async () => {
    h.updateMacros.mockResolvedValue({ ok: true });
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Porcentajes' }));
    field('Carbohidratos', '45');
    field('Proteínas', '25');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar reparto' }));
    await waitFor(() =>
      expect(h.updateMacros).toHaveBeenCalledWith({
        mode: 'percent',
        carbs: 45,
        fat: 30,
        protein: 25,
      }),
    );
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith({ message: 'Reparto guardado', tone: 'success' }),
    );
  });

  it('el modo por defecto se guarda sin valores', async () => {
    h.updateMacros.mockResolvedValue({ ok: true });
    setup({ ...profile, proteinGPerKg: 2 });
    fireEvent.click(screen.getByRole('radio', { name: 'Por defecto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar reparto' }));
    await waitFor(() => expect(h.updateMacros).toHaveBeenCalledWith({ mode: 'default' }));
  });

  it('si el servidor rechaza muestra su mensaje y no avisa éxito', async () => {
    h.updateMacros.mockResolvedValue({ ok: false, error: 'No pudimos guardar el reparto.' });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar reparto' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('No pudimos guardar el reparto.'),
    );
    expect(h.show).not.toHaveBeenCalled();
  });

  it('muestra la meta actual para comparar', () => {
    setup({ ...profile, macroSplit: { carbs: 0.6, fat: 0.25, protein: 0.15 } });
    expect(screen.getByText(/Ahora: Proteínas 79 g/)).toBeTruthy();
  });
});

describe('KcalAdjustmentEditor', () => {
  const setup = (adjustment = 0) =>
    render(
      <KcalAdjustmentEditor profile={{ ...profile, kcalAdjustment: adjustment }} today={TODAY} />,
    );

  it('sin ajuste muestra la meta calculada', () => {
    setup();
    expect(screen.getByText('Sin ajuste')).toBeTruthy();
    expect(screen.getByText('Tu meta: 2.112 kcal')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Guardar ajuste' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('sumar y restar de a 50 cambia la meta en vivo y explica de dónde sale', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sumar 50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sumar 50' }));
    expect(screen.getByText('+100 kcal por día')).toBeTruthy();
    expect(screen.getByText('Tu meta: 2.212 kcal')).toBeTruthy();
    expect(screen.getByText('Calculada 2.112 + ajuste 100')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restar 50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restar 50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restar 50' }));
    expect(screen.getByText('−50 kcal por día')).toBeTruthy();
    expect(screen.getByText('Calculada 2.112 − ajuste 50')).toBeTruthy();
  });

  it('un ajuste que baja de la meta mínima avisa que se corrige al piso', () => {
    setup(-1000);
    expect(screen.getByText('Tu meta: 1.500 kcal')).toBeTruthy();
    expect(screen.getByText(/por debajo del mínimo recomendado/)).toBeTruthy();
  });

  it('no pasa de ±1.000', () => {
    setup(-1000);
    expect((screen.getByRole('button', { name: 'Restar 50' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    cleanup();
    setup(1000);
    expect((screen.getByRole('button', { name: 'Sumar 50' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('guarda el valor y se puede quitar el ajuste', async () => {
    h.updateKcalAdjustment.mockResolvedValue({ ok: true });
    setup(150);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el ajuste' }));
    expect(screen.getByText('Sin ajuste')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }));
    await waitFor(() => expect(h.updateKcalAdjustment).toHaveBeenCalledWith(0));
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith({ message: 'Ajuste guardado', tone: 'success' }),
    );
  });

  it('si el servidor rechaza muestra el error', async () => {
    h.updateKcalAdjustment.mockResolvedValue({
      ok: false,
      error: 'El ajuste tiene que ser un número entero entre −1.000 y 1.000.',
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sumar 50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('entero'));
  });
});
