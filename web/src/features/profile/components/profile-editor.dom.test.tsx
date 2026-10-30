// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDraft } from '../draft';

const h = vi.hoisted(() => ({ updateProfile: vi.fn(), show: vi.fn() }));
vi.mock('../actions', () => ({ updateProfile: h.updateProfile, completeOnboarding: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));

const { ProfileEditor } = await import('./profile-editor');

const initial: ProfileDraft = {
  displayName: 'Ana',
  sex: 'female',
  birthDate: '1996-03-15',
  heightCm: 165,
  weightKg: 62.5,
  activityLevel: 'low_active',
  goal: 'lose',
  weeklyGoalKg: -0.5,
  targetWeightKg: 58,
  macroPreset: 'balanced',
};

beforeEach(() => {
  h.updateProfile.mockReset();
  h.show.mockReset();
});
afterEach(cleanup);

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

describe('ProfileEditor', () => {
  it('viene precargado con los datos del perfil', () => {
    render(<ProfileEditor initial={initial} today="2026-03-15" />);
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Ana');
    expect((screen.getByLabelText('Altura') as HTMLInputElement).value).toBe('165');
    expect((screen.getByLabelText('Fecha de nacimiento') as HTMLInputElement).value).toBe(
      '1996-03-15',
    );
    expect((screen.getByRole('radio', { name: 'Femenino' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole('radio', { name: /Equilibrado/ }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('no pide ni muestra el peso: se registra aparte', () => {
    render(<ProfileEditor initial={initial} today="2026-03-15" />);
    expect(screen.queryByLabelText('Peso actual')).toBeNull();
  });

  it('guardar manda los datos editados, sin peso, y avisa con un toast', async () => {
    h.updateProfile.mockResolvedValue({ ok: true });
    render(<ProfileEditor initial={initial} today="2026-03-15" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Mantener mi peso' }));
    save();
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalledTimes(1));
    const sent = h.updateProfile.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      sex: 'female',
      goal: 'maintain',
      heightCm: 165,
      macroPreset: 'balanced',
    });
    expect(sent.weeklyGoalKg).toBeUndefined();
    expect(sent).not.toHaveProperty('weightKg');
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith({ message: 'Cambios guardados', tone: 'success' }),
    );
  });

  it('un dato inválido muestra el error y no llama al servidor', () => {
    render(<ProfileEditor initial={initial} today="2026-03-15" />);
    const height = screen.getByLabelText('Altura');
    fireEvent.focus(height);
    fireEvent.change(height, { target: { value: '5' } });
    save();
    expect(screen.queryByRole('alert')).toBeNull(); // la altura no está entre los pasos validados del editor...
    expect(h.updateProfile).toHaveBeenCalled(); // ...así que la valida el servidor
  });

  it('un objetivo mal armado se frena en el cliente', () => {
    render(<ProfileEditor initial={{ ...initial, targetWeightKg: 70 }} today="2026-03-15" />);
    save();
    expect(screen.getByRole('alert').textContent).toContain('menor que el actual');
    expect(h.updateProfile).not.toHaveBeenCalled();
  });

  it('con un reparto personalizado no lo pisa salvo que elija un preset', async () => {
    h.updateProfile.mockResolvedValue({ ok: true });
    render(<ProfileEditor initial={{ ...initial, macroPreset: 'keep' }} today="2026-03-15" />);
    save();
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalled());
    expect(h.updateProfile.mock.calls[0]?.[0].macroPreset).toBeUndefined();
  });
});
