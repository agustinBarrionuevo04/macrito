// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ completeOnboarding: vi.fn() }));
vi.mock('../actions', () => ({ completeOnboarding: h.completeOnboarding, updateProfile: vi.fn() }));

const { OnboardingWizard } = await import('./onboarding-wizard');

const TODAY = '2026-03-15';
const TZ = 'America/Argentina/Cordoba';

beforeEach(() => h.completeOnboarding.mockReset());
afterEach(cleanup);

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
const alertText = () => screen.queryByRole('alert')?.textContent ?? null;
const pick = (name: RegExp | string) => fireEvent.click(screen.getByRole('radio', { name }));
const write = (label: RegExp | string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
};

/** Recorre el wizard con datos válidos hasta el resumen: hombre de 25 años, 80 kg, 180 cm, sedentario, baja 0,5 kg/semana. */
function fillUntilSummary() {
  fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
  pick('Masculino');
  next();
  write('Fecha de nacimiento', '2001-03-15');
  next();
  write('Altura', '180');
  write('Peso actual', '80');
  next();
  pick(/Sedentario/);
  next();
  pick('Bajar de peso');
  next();
  next(); // macros: "Alto en proteína" ya viene elegido
}

describe('OnboardingWizard', () => {
  it('empieza con la bienvenida y el aviso médico', () => {
    render(<OnboardingWizard today={TODAY} timezone={TZ} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Armemos tu meta diaria');
    expect(screen.getByText(/no consejo médico/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Atrás' })).toBeNull();
  });

  it('no deja avanzar un paso inválido y muestra el error', () => {
    render(<OnboardingWizard today={TODAY} timezone={TZ} />);
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    next();
    expect(alertText()).toBe('Elegí una opción.');
    expect(screen.getByText('Paso 1 de 7')).toBeTruthy();
  });

  it('valida edad, altura, peso, objetivo y peso objetivo en su paso', () => {
    render(<OnboardingWizard today={TODAY} timezone={TZ} />);
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    pick('Femenino');
    next();
    write('Fecha de nacimiento', '2020-01-01');
    next();
    expect(alertText()).toBe('Macritos es para mayores de 13 años.');
    write('Fecha de nacimiento', '1996-03-15');
    next();
    write('Altura', '90');
    write('Peso actual', '60');
    next();
    expect(alertText()).toContain('altura entre 100 y 250 cm');
    write('Altura', '165');
    next();
    pick(/Poco activo/);
    next();
    pick('Bajar de peso');
    write(/Peso objetivo/, '70'); // más que el actual (60): inválido al bajar
    next();
    expect(alertText()).toContain('menor que el actual');
  });

  it('al elegir bajar o subir pide el ritmo, y mantener no', () => {
    render(<OnboardingWizard today={TODAY} timezone={TZ} />);
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    pick('Masculino');
    next();
    write('Fecha de nacimiento', '2001-03-15');
    next();
    write('Altura', '180');
    write('Peso actual', '80');
    next();
    pick(/Muy activo/);
    next();
    pick('Bajar de peso');
    expect(
      (screen.getByRole('radio', { name: /0,5 kg por semana/ }) as HTMLInputElement).checked,
    ).toBe(true);
    pick('Subir de peso');
    expect(
      (screen.getByRole('radio', { name: /0,25 kg por semana/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.queryByRole('radio', { name: /1 kg por semana/ })).toBeNull();
    pick('Mantener mi peso');
    expect(screen.queryByRole('radio', { name: /por semana/ })).toBeNull();
  });

  it('el resumen muestra la meta calculada con su desglose (IOM p. 204)', () => {
    render(<OnboardingWizard today={TODAY} timezone={TZ} />);
    fillUntilSummary();
    // TEE 2662,4 − 550 (0,5 kg/semana × 1100) = 2112,4 kcal; proteína 2 g/kg × 80 = 160 g; grasa 25 %.
    expect(screen.getByText('Tu meta diaria')).toBeTruthy();
    expect(screen.getAllByText('2.112').length).toBeGreaterThan(0);
    expect(screen.getByText('160 g')).toBeTruthy();
    expect(screen.getByText('2.662 kcal')).toBeTruthy();
    expect(screen.getByText('−550 kcal')).toBeTruthy();
  });

  it('confirmar manda los datos al servidor, con el peso y el preset', async () => {
    h.completeOnboarding.mockResolvedValue({ ok: true });
    render(<OnboardingWizard today={TODAY} timezone={TZ} />);
    fillUntilSummary();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y empezar' }));
    await waitFor(() => expect(h.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(h.completeOnboarding).toHaveBeenCalledWith({
      displayName: undefined,
      sex: 'male',
      birthDate: '2001-03-15',
      heightCm: 180,
      weightKg: 80,
      targetWeightKg: undefined,
      activityLevel: 'sedentary',
      goal: 'lose',
      weeklyGoalKg: -0.5,
      macroPreset: 'high_protein',
    });
  });

  it('si el servidor rechaza, muestra el error y se queda en el resumen', async () => {
    h.completeOnboarding.mockResolvedValue({
      ok: false,
      error: 'No pudimos guardar los datos. Probá de nuevo.',
    });
    render(<OnboardingWizard today={TODAY} timezone={TZ} />);
    fillUntilSummary();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y empezar' }));
    await waitFor(() => expect(alertText()).toContain('No pudimos guardar'));
    // El error aparece mientras la transición todavía figura como pendiente ("Guardando…"): el botón
    // vuelve a su texto un instante después, así que hay que esperarlo.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar y empezar' })).toBeTruthy(),
    );
  });

  it('atrás conserva lo cargado', () => {
    render(<OnboardingWizard today={TODAY} timezone={TZ} />);
    fillUntilSummary();
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    pick(/Equilibrado/);
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect((screen.getByRole('radio', { name: /Equilibrado/ }) as HTMLInputElement).checked).toBe(
      true,
    );
  });
});
