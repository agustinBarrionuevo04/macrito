// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiaryEntry } from '../types';

const h = vi.hoisted(() => ({
  addQuickEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  restoreEntry: vi.fn(),
  copyEntries: vi.fn(),
  show: vi.fn(),
}));
vi.mock('../actions', () => ({
  addQuickEntry: h.addQuickEntry,
  updateEntry: h.updateEntry,
  deleteEntry: h.deleteEntry,
  restoreEntry: h.restoreEntry,
  copyEntries: h.copyEntries,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { DiaryView } = await import('./diary-view');

const DAY = '2026-03-15';
const TODAY = '2026-03-15';
const TARGETS = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 };

const entry = (id: string, extra: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id,
  mealType: 'breakfast',
  foodId: 'f1',
  name: 'Leche',
  quantityG: 200,
  kcal: 120,
  protein_g: 6,
  carbs_g: 10,
  fat_g: 6,
  origin: 'search',
  isEstimate: false,
  createdAt: '2026-03-15T11:00:00.000Z',
  ...extra,
});

const ENTRIES = [
  entry('e1'),
  entry('e2', { name: 'Milanesa', mealType: 'lunch', quantityG: 150, kcal: 450, isEstimate: true }),
  entry('e3', { name: 'Pizza', mealType: 'dinner', quantityG: 0, kcal: 300, origin: 'manual' }),
];

const renderView = (entries: DiaryEntry[] = ENTRIES, targets: typeof TARGETS | null = TARGETS) =>
  render(<DiaryView day={DAY} today={TODAY} entries={entries} targets={targets} />);

beforeEach(() => {
  // jsdom no implementa <dialog>.showModal/close.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  Object.values(h).forEach((fn) => fn.mockReset());
});
afterEach(cleanup);

const dialog = () => document.querySelector('dialog[open]') as HTMLElement;

describe('DiaryView: resumen', () => {
  it('muestra las calorías que quedan y las consumidas', () => {
    renderView();
    // 120 + 450 + 300 = 870 consumidas, meta 2.000 → quedan 1.130
    expect(screen.getByTestId('kcal-remaining').textContent).toBe('1.130');
    expect(screen.getByText('kcal restantes')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '870 de 2.000 kcal' })).toBeTruthy();
  });

  it('si se pasó de la meta lo dice con "kcal de más"', () => {
    renderView([entry('big', { kcal: 2500 })]);
    expect(screen.getByTestId('kcal-remaining').textContent).toBe('500');
    expect(screen.getByText('kcal de más')).toBeTruthy();
  });

  it('sin meta (perfil no calculable) muestra lo consumido y el aviso', () => {
    renderView(ENTRIES, null);
    expect(screen.getByText(/Completá tu perfil/)).toBeTruthy();
    expect(screen.queryByTestId('kcal-remaining')).toBeNull();
  });
});

describe('DiaryView: comidas', () => {
  it('agrupa las entradas por comida y muestra el total de cada una', () => {
    renderView();
    const lunch = screen.getByRole('region', { name: 'Almuerzo' });
    expect(within(lunch).getByText('Milanesa')).toBeTruthy();
    expect(within(lunch).getByText('450 kcal')).toBeTruthy();
    const snack = screen.getByRole('region', { name: 'Merienda' });
    expect(within(snack).getByText('Sin registros')).toBeTruthy();
    expect(within(snack).getByText('0 kcal')).toBeTruthy();
  });

  it('marca con "~" las entradas estimadas y no las demás', () => {
    renderView();
    const estimated = screen.getByRole('button', { name: 'Editar Milanesa' });
    expect(within(estimated).getByRole('img', { name: 'Valor estimado' }).textContent).toBe('~');
    const exact = screen.getByRole('button', { name: 'Editar Leche' });
    expect(within(exact).queryByRole('img')).toBeNull();
  });

  it('muestra la cantidad en gramos, o "Calorías rápidas" si no tiene', () => {
    renderView();
    expect(
      within(screen.getByRole('button', { name: 'Editar Leche' })).getByText('200 g'),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('button', { name: 'Editar Pizza' })).getByText('Calorías rápidas'),
    ).toBeTruthy();
  });

  it('cada comida tiene un link para agregar con la comida y el día', () => {
    renderView();
    const link = screen.getByRole('link', { name: 'Agregar a merienda' });
    expect(link.getAttribute('href')).toBe(`/add?meal=snack&date=${DAY}`);
  });

  it('sin entradas muestra el estado vacío y no ofrece copiar el día', () => {
    renderView([]);
    expect(screen.getByText('Todavía no registraste nada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copiar el día' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Copiar (desayuno|almuerzo)/ })).toBeNull();
  });

  it('con entradas no muestra el estado vacío', () => {
    renderView();
    expect(screen.queryByText('Todavía no registraste nada')).toBeNull();
  });
});

describe('DiaryView: calorías rápidas', () => {
  const open = () =>
    fireEvent.click(screen.getAllByRole('button', { name: 'Calorías rápidas' })[0]!);
  const type = (label: string, value: string) => {
    const input = within(dialog()).getByLabelText(new RegExp(label));
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
  };

  it('manda el valor con la coma decimal interpretada y avisa con un toast', async () => {
    h.addQuickEntry.mockResolvedValue({ ok: true, id: 'x' });
    renderView();
    open();
    fireEvent.change(within(dialog()).getByLabelText(/Descripción/), {
      target: { value: 'Pizza' },
    });
    type('^Calorías', '450');
    type('^Proteínas', '20,5');
    fireEvent.change(within(dialog()).getByLabelText('Comida'), { target: { value: 'dinner' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Agregar' }));

    await waitFor(() => expect(h.addQuickEntry).toHaveBeenCalledTimes(1));
    expect(h.addQuickEntry).toHaveBeenCalledWith(
      {
        name: 'Pizza',
        kcal: 450,
        protein_g: 20.5,
        carbs_g: undefined,
        fat_g: undefined,
        meal_type: 'dinner',
      },
      DAY,
    );
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith({ message: 'Agregado a cena', tone: 'success' }),
    );
  });

  it('sin calorías muestra el error y no llama al servidor', () => {
    renderView();
    open();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Agregar' }));
    expect(within(dialog()).getByRole('alert').textContent).toContain('calorías');
    expect(h.addQuickEntry).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza muestra su mensaje y no avisa éxito', async () => {
    h.addQuickEntry.mockResolvedValue({ ok: false, error: 'No pudimos guardar el cambio.' });
    renderView();
    open();
    type('^Calorías', '100');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Agregar' }));
    await waitFor(() =>
      expect(within(dialog()).getByRole('alert').textContent).toBe('No pudimos guardar el cambio.'),
    );
    expect(h.show).not.toHaveBeenCalled();
  });
});

describe('DiaryView: editar una entrada', () => {
  const openEntry = (name: string) =>
    fireEvent.click(screen.getByRole('button', { name: `Editar ${name}` }));
  const quantity = (value: string) => {
    const input = within(dialog()).getByLabelText('Cantidad');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
  };

  it('muestra la nutrición reescalada en vivo, proporcional a la propia entrada', () => {
    renderView();
    openEntry('Leche');
    quantity('300');
    // 120 kcal por 200 g → 180 kcal por 300 g
    expect(within(dialog()).getByText('180 kcal')).toBeTruthy();
  });

  it('guarda solo lo que cambió', async () => {
    h.updateEntry.mockResolvedValue({ ok: true });
    renderView();
    openEntry('Leche');
    quantity('300');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(h.updateEntry).toHaveBeenCalledWith('e1', { quantity_g: 300 }));

    h.updateEntry.mockClear();
    openEntry('Milanesa');
    fireEvent.change(within(dialog()).getByLabelText('Comida'), { target: { value: 'dinner' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(h.updateEntry).toHaveBeenCalledWith('e2', { meal_type: 'dinner' }));
  });

  it('sin cambios no llama al servidor', () => {
    renderView();
    openEntry('Leche');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    expect(h.updateEntry).not.toHaveBeenCalled();
  });

  it('una cantidad inválida muestra el error y no se guarda', () => {
    renderView();
    openEntry('Leche');
    quantity('0');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog()).getByRole('alert').textContent).toContain('cantidad');
    quantity('');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    expect(h.updateEntry).not.toHaveBeenCalled();
  });

  it('las calorías rápidas no tienen campo de cantidad, pero se les puede cambiar la comida', async () => {
    h.updateEntry.mockResolvedValue({ ok: true });
    renderView();
    openEntry('Pizza');
    expect(within(dialog()).queryByLabelText('Cantidad')).toBeNull();
    expect(within(dialog()).getByText(/no tiene cantidad/)).toBeTruthy();
    fireEvent.change(within(dialog()).getByLabelText('Comida'), { target: { value: 'lunch' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(h.updateEntry).toHaveBeenCalledWith('e3', { meal_type: 'lunch' }));
  });

  it('borrar avisa con "Deshacer", que vuelve a insertar la misma entrada en el mismo día', async () => {
    h.deleteEntry.mockResolvedValue({ ok: true });
    h.restoreEntry.mockResolvedValue({ ok: true, id: 'nuevo' });
    renderView();
    openEntry('Milanesa');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(h.deleteEntry).toHaveBeenCalledWith('e2'));

    await waitFor(() => expect(h.show).toHaveBeenCalledTimes(1));
    const toast = h.show.mock.calls[0]![0] as {
      message: string;
      action: { label: string; onClick: () => void };
    };
    expect(toast.message).toBe('Entrada eliminada');
    expect(toast.action.label).toBe('Deshacer');

    toast.action.onClick();
    await waitFor(() => expect(h.restoreEntry).toHaveBeenCalledTimes(1));
    expect(h.restoreEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        day: DAY,
        mealType: 'lunch',
        foodId: 'f1',
        name: 'Milanesa',
        quantityG: 150,
        kcal: 450,
        isEstimate: true,
        createdAt: '2026-03-15T11:00:00.000Z',
      }),
    );
    await waitFor(() =>
      expect(h.show).toHaveBeenLastCalledWith({ message: 'Entrada restaurada', tone: 'success' }),
    );
  });

  it('si falla el borrado no avisa que se borró', async () => {
    h.deleteEntry.mockResolvedValue({ ok: false, error: 'No encontramos la entrada.' });
    renderView();
    openEntry('Leche');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() =>
      expect(within(dialog()).getByRole('alert').textContent).toBe('No encontramos la entrada.'),
    );
    expect(h.show).not.toHaveBeenCalled();
  });
});

describe('DiaryView: copiar', () => {
  const setDate = (value: string) =>
    fireEvent.change(within(dialog()).getByLabelText('Copiar a'), { target: { value } });

  it('copia una comida a otro día', async () => {
    h.copyEntries.mockResolvedValue({ ok: true, count: 1 });
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar almuerzo' }));
    setDate('2026-03-10');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copiar' }));
    await waitFor(() =>
      expect(h.copyEntries).toHaveBeenCalledWith({
        source: { scope: 'meal', day: DAY, mealType: 'lunch' },
        toDay: '2026-03-10',
      }),
    );
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith({ message: 'Copiado al 10/03/2026', tone: 'success' }),
    );
  });

  it('copia el día entero; por defecto el destino es ayer si se mira hoy', async () => {
    h.copyEntries.mockResolvedValue({ ok: true, count: 3 });
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar el día' }));
    expect((within(dialog()).getByLabelText('Copiar a') as HTMLInputElement).value).toBe(
      '2026-03-14',
    );
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copiar' }));
    await waitFor(() =>
      expect(h.copyEntries).toHaveBeenCalledWith({
        source: { scope: 'day', day: DAY },
        toDay: '2026-03-14',
      }),
    );
  });

  it('no deja copiar una comida o el día sobre sí mismo ni a un día futuro', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar el día' }));
    setDate(DAY);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copiar' }));
    expect(within(dialog()).getByRole('alert').textContent).toContain('otro día');
    setDate('2026-03-16');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copiar' }));
    expect(within(dialog()).getByRole('alert').textContent).toContain('fecha');
    expect(h.copyEntries).not.toHaveBeenCalled();
  });

  it('una entrada se copia a otra comida elegida', async () => {
    h.copyEntries.mockResolvedValue({ ok: true, count: 1 });
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Leche' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copiar a otro día' }));
    fireEvent.change(within(dialog()).getByLabelText('Comida'), { target: { value: 'snack' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copiar' }));
    await waitFor(() =>
      expect(h.copyEntries).toHaveBeenCalledWith({
        source: { scope: 'entry', id: 'e1' },
        toDay: '2026-03-14',
        toMeal: 'snack',
      }),
    );
  });
});
