// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@/types';
import type { ReviewItem } from '../resolve';

const h = vi.hoisted(() => ({ createAiFood: vi.fn(), show: vi.fn() }));
vi.mock('../actions', () => ({ createAiFood: h.createAiFood }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));

const { ReviewScreen } = await import('./review-screen');

const food = (name: string, kcal = 200): Food => ({
  id: `id-${name}`,
  source: 'ar_seed',
  name,
  per100g: { kcal, protein_g: 10, carbs_g: 20, fat_g: 5 },
  portions: [],
});

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  key: 'k1',
  query: 'milanesa',
  food: food('Milanesa de carne'),
  guess: null,
  grams: 150,
  confidence: 'high',
  ...over,
});

type Props = Parameters<typeof ReviewScreen>[0];
const setup = (items: ReviewItem[], over: Partial<Props> = {}) => {
  const p = {
    origin: 'ai_photo' as const,
    defaultMeal: 'lunch' as const,
    renderPicker: (onSelect: (f: Food) => void) => (
      <button type="button" onClick={() => onSelect(food('Pollo grillado', 150))}>
        elegir pollo
      </button>
    ),
    onAdd: vi.fn<Props['onAdd']>().mockResolvedValue({ ok: true }),
    onDone: vi.fn(),
    onViewDiary: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
  const onAdd = p.onAdd as ReturnType<typeof vi.fn<Props['onAdd']>>;
  render(<ReviewScreen items={items} {...p} />);
  return { ...p, onAdd };
};

const grams = (name: string, value: string) => {
  const input = screen.getByLabelText(`Gramos de ${name}`);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Agregar todo al diario' }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  h.createAiFood.mockReset();
  h.show.mockReset();
});
afterEach(cleanup);

describe('ReviewScreen', () => {
  it('muestra cada renglón con sus kcal y el total estimado con "~"', () => {
    setup([
      item(),
      item({ key: 'k2', query: 'puré', food: food('Puré de papa', 100), grams: 200 }),
    ]);
    expect(screen.getByText('300 kcal')).toBeTruthy(); // 200 kcal/100 g × 150 g
    expect(screen.getByText('200 kcal')).toBeTruthy();
    expect(screen.getByText(/~500/)).toBeTruthy();
  });

  it('confirmar manda addEntry por renglón: origen de IA, estimado y la comida elegida', async () => {
    const p = setup([item(), item({ key: 'k2', food: food('Puré de papa'), grams: 100 })]);
    fireEvent.change(screen.getByLabelText('Comida'), { target: { value: 'dinner' } });
    submit();
    await waitFor(() => expect(p.onAdd).toHaveBeenCalledTimes(2));
    expect(p.onAdd).toHaveBeenNthCalledWith(1, {
      food: expect.objectContaining({ name: 'Milanesa de carne' }),
      quantity_g: 150,
      meal_type: 'dinner',
      origin: 'ai_photo',
      is_estimate: true,
    });
    await waitFor(() => expect(p.onDone).toHaveBeenCalled());
    expect(h.show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Agregado a cena',
        action: expect.objectContaining({ label: 'Ver diario' }),
      }),
    );
  });

  it('el origen de texto se respeta', async () => {
    const p = setup([item()], { origin: 'ai_text' });
    submit();
    await waitFor(() =>
      expect(p.onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ origin: 'ai_text', is_estimate: true }),
      ),
    );
  });

  it('editar los gramos actualiza las kcal y es lo que se manda', async () => {
    const p = setup([item()]);
    grams('Milanesa de carne', '300');
    expect(screen.getByText('600 kcal')).toBeTruthy();
    submit();
    await waitFor(() =>
      expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ quantity_g: 300 })),
    );
  });

  it('se puede quitar un renglón; sin renglones ofrece analizar de nuevo', () => {
    const p = setup([item()]);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Milanesa de carne' }));
    expect(screen.getByText(/No encontramos comida/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Agregar todo al diario' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar de nuevo' }));
    expect(p.onRetry).toHaveBeenCalled();
  });

  it('un renglón sin alimento ni valores sugeridos bloquea la confirmación hasta elegir uno', async () => {
    const p = setup([item({ food: null, guess: null, query: 'cosa rara', grams: 100 })]);
    const button = screen.getByRole('button', {
      name: 'Agregar todo al diario',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/No lo encontramos en la base/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir alimento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'elegir pollo' }));
    expect(screen.getByText('Pollo grillado')).toBeTruthy();
    expect(button.disabled).toBe(false);
    submit();
    await waitFor(() =>
      expect(p.onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ food: expect.objectContaining({ name: 'Pollo grillado' }) }),
      ),
    );
  });

  it('sin gramos bloquea la confirmación y lo avisa', () => {
    setup([item({ grams: null })]);
    expect(
      (screen.getByRole('button', { name: 'Agregar todo al diario' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText('Falta la cantidad')).toBeTruthy();
    grams('Milanesa de carne', '120');
    expect(
      (screen.getByRole('button', { name: 'Agregar todo al diario' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('gramos fuera de rango bloquean', () => {
    setup([item()]);
    grams('Milanesa de carne', '10001');
    expect(
      (screen.getByRole('button', { name: 'Agregar todo al diario' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    grams('Milanesa de carne', '0');
    expect(
      (screen.getByRole('button', { name: 'Agregar todo al diario' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('un alimento sin verificar (valores sugeridos) se crea recién al confirmar', async () => {
    h.createAiFood.mockResolvedValue({
      ok: true,
      food: { ...food('budín de zapallo'), id: 'new1', source: 'ai_unverified' },
    });
    const p = setup([
      item({
        food: null,
        query: 'budín de zapallo',
        guess: { kcal: 200, protein_g: 4, carbs_g: 30, fat_g: 7 },
        grams: 100,
      }),
    ]);
    expect(screen.getByText('Sin verificar')).toBeTruthy();
    expect(h.createAiFood).not.toHaveBeenCalled();
    submit();
    await waitFor(() => expect(p.onAdd).toHaveBeenCalled());
    expect(h.createAiFood).toHaveBeenCalledWith({
      name: 'budín de zapallo',
      per100g: { kcal: 200, protein_g: 4, carbs_g: 30, fat_g: 7 },
    });
    expect(p.onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ food: expect.objectContaining({ id: 'new1' }), is_estimate: true }),
    );
  });

  it('marca "Poca seguridad" solo en los de confianza baja', () => {
    setup([
      item({ confidence: 'low' }),
      item({ key: 'k2', food: food('Pan'), confidence: 'high' }),
    ]);
    expect(screen.getAllByText('Poca seguridad')).toHaveLength(1);
  });

  it('agregar otro alimento suma un renglón con el alimento elegido', async () => {
    setup([item()]);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro alimento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'elegir pollo' }));
    expect(screen.getByText('Pollo grillado')).toBeTruthy();
    expect(screen.getByLabelText('Gramos de Pollo grillado')).toBeTruthy();
  });

  it('cambiar el alimento de un renglón conserva los gramos', async () => {
    setup([item()]);
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar alimento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'elegir pollo' }));
    expect((screen.getByLabelText('Gramos de Pollo grillado') as HTMLInputElement).value).toBe(
      '150',
    );
    expect(screen.getByText('225 kcal')).toBeTruthy(); // 150 kcal/100 g × 150 g
  });

  describe('fallas parciales', () => {
    it('lo que falla queda en pantalla con su error y lo que se agregó se va', async () => {
      const p = setup([
        item(),
        item({ key: 'k2', query: 'puré', food: food('Puré de papa'), grams: 100 }),
      ]);
      p.onAdd
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, error: 'No pudimos guardar el cambio.' });
      submit();
      await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
      expect(screen.queryByText('Milanesa de carne')).toBeNull();
      expect(screen.getByText('Puré de papa')).toBeTruthy();
      expect(screen.getByText('No pudimos guardar el cambio.')).toBeTruthy();
      expect(screen.getByText(/No pudimos agregar 1 de los renglones/)).toBeTruthy();
      expect(p.onDone).not.toHaveBeenCalled();
      expect(h.show).not.toHaveBeenCalled();
    });

    it('si no se puede crear el alimento sin verificar, el renglón queda con su error', async () => {
      h.createAiFood.mockResolvedValue({ ok: false, error: 'No pudimos guardar el alimento.' });
      const p = setup([
        item({
          food: null,
          query: 'budín',
          guess: { kcal: 200, protein_g: 4, carbs_g: 30, fat_g: 7 },
          grams: 100,
        }),
      ]);
      submit();
      await waitFor(() => expect(screen.getByText('No pudimos guardar el alimento.')).toBeTruthy());
      expect(p.onAdd).not.toHaveBeenCalled();
    });
  });

  it('el botón de ver diario del aviso llama a onViewDiary', async () => {
    const p = setup([item()]);
    submit();
    await waitFor(() => expect(h.show).toHaveBeenCalled());
    h.show.mock.calls[0]![0].action.onClick();
    expect(p.onViewDiary).toHaveBeenCalled();
  });
});
