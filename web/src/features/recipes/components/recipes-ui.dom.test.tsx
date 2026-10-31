// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@/types';
import type { RecipeDetail, RecipeSummary } from '../types';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  show: vi.fn(),
  saveRecipe: vi.fn(),
  deleteRecipe: vi.fn(),
  duplicateRecipe: vi.fn(),
  importRecipeText: vi.fn(),
  addCombo: vi.fn(),
  saveMealAsCombo: vi.fn(),
  copyEntries: vi.fn(),
  searchFoods: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));
vi.mock('../actions', () => ({
  saveRecipe: h.saveRecipe,
  deleteRecipe: h.deleteRecipe,
  duplicateRecipe: h.duplicateRecipe,
  importRecipeText: h.importRecipeText,
  addCombo: h.addCombo,
  saveMealAsCombo: h.saveMealAsCombo,
}));
vi.mock('@/features/diary/actions', () => ({ copyEntries: h.copyEntries }));
vi.mock('@/features/add-food/api', async () => {
  const actual =
    await vi.importActual<typeof import('@/features/add-food/api')>('@/features/add-food/api');
  return { ...actual, searchFoods: h.searchFoods };
});

const { RecipeEditor } = await import('./recipe-editor');
const { QuickPanel } = await import('./quick-panel');
const { ImportSheet } = await import('./import-sheet');
const { SaveComboSheet } = await import('./save-combo-sheet');

const RID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const flour: Food = {
  id: 'f1',
  source: 'ar_seed',
  name: 'Harina',
  per100g: { kcal: 364, protein_g: 10, carbs_g: 76, fat_g: 1 },
  portions: [],
};

const detail = (extra: Partial<RecipeDetail> = {}): RecipeDetail => ({
  id: RID,
  kind: 'recipe',
  name: 'Tarta',
  servings: 4,
  finalWeightG: null,
  foodId: 'food-1',
  items: [
    {
      foodId: null,
      name: 'Harina',
      grams: 200,
      kcal_100g: 364,
      protein_100g: 10,
      carbs_100g: 76,
      fat_100g: 1,
    },
    {
      foodId: null,
      name: 'Huevo',
      grams: 100,
      kcal_100g: 143,
      protein_100g: 13,
      carbs_100g: 1,
      fat_100g: 10,
    },
  ],
  ...extra,
});

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

const num = (label: string | RegExp, value: string) => {
  const input = screen.getByLabelText(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

describe('RecipeEditor', () => {
  it('muestra los valores por porción en vivo (calculados a mano: 871 kcal / 4 = 218)', () => {
    render(<RecipeEditor recipe={detail()} kind="recipe" favorites={[]} recents={[]} />);
    const summary = screen.getByRole('region', { name: 'Por porción' });
    expect(within(summary).getByText('218')).toBeTruthy();
    expect(within(summary).getByText(/P 8,3 · C 38,3 · G 3/)).toBeTruthy();
    expect(
      within(summary).getByText(/Pesa 300 g · 1 porción = 75 g · Por 100 g: 290 kcal/),
    ).toBeTruthy();
  });

  it('al cambiar gramos, porciones o peso final se recalcula', () => {
    render(<RecipeEditor recipe={detail()} kind="recipe" favorites={[]} recents={[]} />);
    num('Gramos de Harina', '100'); // 364 + 143 = 507 kcal
    num('Porciones', '2');
    const summary = screen.getByRole('region', { name: 'Por porción' });
    expect(within(summary).getByText('254')).toBeTruthy(); // 507 / 2 = 253,5
    num('Peso final', '150');
    expect(within(summary).getByText(/Pesa 150 g · 1 porción = 75 g/)).toBeTruthy();
  });

  it('un combo muestra el total y no pide porciones', () => {
    render(
      <RecipeEditor
        recipe={detail({ kind: 'combo', servings: 1 })}
        kind="combo"
        favorites={[]}
        recents={[]}
      />,
    );
    expect(screen.queryByLabelText('Porciones')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Total' })).getByText('871')).toBeTruthy();
  });

  it('guarda mandando nombre, porciones e ingredientes, y vuelve a la lista', async () => {
    h.saveRecipe.mockResolvedValue({ ok: true, id: RID });
    render(<RecipeEditor recipe={detail()} kind="recipe" favorites={[]} recents={[]} />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Tarta grande' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(h.saveRecipe).toHaveBeenCalledTimes(1));
    const [id, payload] = h.saveRecipe.mock.calls[0]!;
    expect(id).toBe(RID);
    expect(payload).toMatchObject({
      kind: 'recipe',
      name: 'Tarta grande',
      servings: 4,
      finalWeightG: null,
    });
    expect(payload.items.map((i: { name: string }) => i.name)).toEqual(['Harina', 'Huevo']);
    expect(payload.items[0]).not.toHaveProperty('key');
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/recipes'));
  });

  it('una receta nueva se guarda con id null; si el servidor rechaza, muestra el error y no navega', async () => {
    h.saveRecipe.mockResolvedValue({ ok: false, error: 'Agregá al menos un ingrediente.' });
    render(<RecipeEditor recipe={null} kind="recipe" favorites={[]} recents={[]} />);
    expect(screen.getByText('Agregá al menos un ingrediente.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Agregá al menos un ingrediente.'),
    );
    expect(h.saveRecipe.mock.calls[0]![0]).toBeNull();
    expect(h.push).not.toHaveBeenCalled();
  });

  it('agrega un ingrediente desde el buscador con sus valores y una cantidad inicial', async () => {
    h.searchFoods.mockResolvedValue({ foods: [flour], degraded: false });
    render(<RecipeEditor recipe={null} kind="recipe" favorites={[]} recents={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar ingrediente' }));
    fireEvent.change(await screen.findByLabelText('Buscar alimento'), {
      target: { value: 'harina' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir Harina' }));
    expect(screen.getByLabelText('Gramos de Harina')).toBeTruthy();
    expect((screen.getByLabelText('Gramos de Harina') as HTMLInputElement).value).toBe('100');
    expect(screen.queryByRole('button', { name: /favoritos/ })).toBeNull(); // sin estrellas en el selector
  });

  it('se puede quitar un ingrediente', () => {
    render(<RecipeEditor recipe={detail()} kind="recipe" favorites={[]} recents={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Harina' }));
    expect(screen.queryByLabelText('Gramos de Harina')).toBeNull();
    expect(screen.getByLabelText('Gramos de Huevo')).toBeTruthy();
  });

  it('eliminar pide confirmación antes de borrar', async () => {
    h.deleteRecipe.mockResolvedValue({ ok: true });
    render(<RecipeEditor recipe={detail()} kind="recipe" favorites={[]} recents={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(h.deleteRecipe).not.toHaveBeenCalled();
    expect(dlg().getByText(/¿Eliminar "Tarta"\?/)).toBeTruthy();
    fireEvent.click(dlg().getByRole('button', { name: 'Cancelar' }));
    expect(h.deleteRecipe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(dlg().getByRole('button', { name: 'Sí, eliminar' }));
    await waitFor(() => expect(h.deleteRecipe).toHaveBeenCalledWith(RID));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/recipes'));
  });

  it('duplicar abre la copia', async () => {
    h.duplicateRecipe.mockResolvedValue({ ok: true, id: 'nueva' });
    render(<RecipeEditor recipe={detail()} kind="recipe" favorites={[]} recents={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/recipes/nueva'));
  });

  it('"Copiar para compartir" deja el texto en el portapapeles, con lo que hay en pantalla', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<RecipeEditor recipe={detail()} kind="recipe" favorites={[]} recents={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar para compartir' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const exported = JSON.parse(writeText.mock.calls[0]![0]);
    expect(exported).toMatchObject({ macritos: 1, name: 'Tarta', servings: 4 });
    expect(exported.items).toHaveLength(2);
    expect(h.show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
  });

  it('si el portapapeles falla, avisa', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    });
    render(<RecipeEditor recipe={detail()} kind="recipe" favorites={[]} recents={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar para compartir' }));
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' })),
    );
  });

  it('una receta nueva no ofrece duplicar ni eliminar', () => {
    render(<RecipeEditor recipe={null} kind="recipe" favorites={[]} recents={[]} />);
    expect(screen.queryByRole('button', { name: 'Duplicar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
  });
});

describe('QuickPanel', () => {
  const counts = {
    breakfast: { yesterday: 0, lastWeek: 0 },
    lunch: { yesterday: 2, lastWeek: 0 },
    snack: { yesterday: 0, lastWeek: 0 },
    dinner: { yesterday: 1, lastWeek: 3 },
  };
  const repeat = { counts, yesterday: '2026-03-14', lastWeek: '2026-03-08' };
  const combo: RecipeSummary = {
    id: RID,
    kind: 'combo',
    name: 'Desayuno de siempre',
    servings: 1,
    finalWeightG: null,
    foodId: null,
    itemCount: 2,
    kcal: 320,
  };
  const setup = (over: Partial<Parameters<typeof QuickPanel>[0]> = {}) => {
    const onViewDiary = vi.fn();
    render(
      <QuickPanel
        day="2026-03-15"
        initialMeal="lunch"
        combos={[combo]}
        repeat={repeat}
        onViewDiary={onViewDiary}
        {...over}
      />,
    );
    return { onViewDiary };
  };

  it('repite la comida elegida de ayer (copia la comida al día que se está cargando)', async () => {
    h.copyEntries.mockResolvedValue({ ok: true, count: 2 });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ayer (2)' }));
    await waitFor(() =>
      expect(h.copyEntries).toHaveBeenCalledWith({
        source: { scope: 'meal', day: '2026-03-14', mealType: 'lunch' },
        toDay: '2026-03-15',
      }),
    );
    expect(h.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Repetido: 2 en almuerzo' }),
    );
  });

  it('solo deja repetir lo que existe: la semana pasada está deshabilitada si no hay nada', () => {
    setup();
    expect(
      (screen.getByRole('button', { name: 'Semana pasada (0)' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole('button', { name: 'Ayer (2)' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('al cambiar de comida cambian las cantidades y se repite esa comida', async () => {
    h.copyEntries.mockResolvedValue({ ok: true, count: 3 });
    setup();
    fireEvent.change(screen.getByLabelText('Comida'), { target: { value: 'dinner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Semana pasada (3)' }));
    await waitFor(() =>
      expect(h.copyEntries).toHaveBeenCalledWith({
        source: { scope: 'meal', day: '2026-03-08', mealType: 'dinner' },
        toDay: '2026-03-15',
      }),
    );
  });

  it('si no hay nada para repetir en esa comida, lo dice', () => {
    setup({ initialMeal: 'breakfast' });
    expect(screen.getByText(/No tenés registros de esa comida/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Ayer/ })).toBeNull();
  });

  it('agrega una comida frecuente a la comida elegida y avisa con "Ver diario"', async () => {
    h.addCombo.mockResolvedValue({ ok: true, count: 2 });
    const { onViewDiary } = setup();
    fireEvent.change(screen.getByLabelText('Comida'), { target: { value: 'breakfast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Desayuno de siempre' }));
    await waitFor(() => expect(h.addCombo).toHaveBeenCalledWith(RID, '2026-03-15', 'breakfast'));
    const toast = h.show.mock.calls[0]![0];
    expect(toast.message).toBe('Agregado a desayuno');
    toast.action.onClick();
    expect(onViewDiary).toHaveBeenCalled();
  });

  it('muestra el error del servidor y no avisa éxito', async () => {
    h.addCombo.mockResolvedValue({ ok: false, error: 'No encontramos la receta.' });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Desayuno de siempre' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('No encontramos la receta.'),
    );
    expect(h.show).not.toHaveBeenCalled();
  });

  it('sin datos de repetición ni combos muestra solo el enlace a las recetas', () => {
    setup({ combos: [], repeat: null });
    expect(screen.queryByText('Comidas frecuentes')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Mis recetas y comidas frecuentes' }).getAttribute('href'),
    ).toBe('/recipes');
  });
});

describe('ImportSheet', () => {
  it('importa el texto pegado y abre la receta creada', async () => {
    h.importRecipeText.mockResolvedValue({ ok: true, id: 'nueva' });
    render(<ImportSheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    fireEvent.change(dlg().getByLabelText('Texto de la receta'), {
      target: { value: '{"macritos":1}' },
    });
    fireEvent.click(dlg().getByRole('button', { name: 'Importar' }));
    await waitFor(() => expect(h.importRecipeText).toHaveBeenCalledWith('{"macritos":1}'));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/recipes/nueva'));
  });

  it('muestra el motivo si no se pudo importar y se va al seguir escribiendo', async () => {
    h.importRecipeText.mockResolvedValue({
      ok: false,
      error: 'Ese texto no es una receta exportada.',
    });
    render(<ImportSheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    fireEvent.click(dlg().getByRole('button', { name: 'Importar' }));
    await waitFor(() => expect(dlg().getByRole('alert').textContent).toContain('no es una receta'));
    fireEvent.change(dlg().getByLabelText('Texto de la receta'), { target: { value: 'x' } });
    expect(dlg().queryByRole('alert')).toBeNull();
    expect(h.push).not.toHaveBeenCalled();
  });
});

describe('SaveComboSheet', () => {
  it('guarda la comida como comida frecuente, con el nombre editable', async () => {
    h.saveMealAsCombo.mockResolvedValue({ ok: true, id: RID });
    const onClose = vi.fn();
    render(<SaveComboSheet meal="lunch" day="2026-03-15" onClose={onClose} />);
    expect((dlg().getByLabelText('Nombre de la comida') as HTMLInputElement).value).toBe(
      'Almuerzo',
    );
    fireEvent.change(dlg().getByLabelText('Nombre de la comida'), {
      target: { value: 'Mi almuerzo' },
    });
    fireEvent.click(dlg().getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(h.saveMealAsCombo).toHaveBeenCalledWith({
        day: '2026-03-15',
        mealType: 'lunch',
        name: 'Mi almuerzo',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Guardada como comida frecuente' }),
    );
  });

  it('muestra el error (por ejemplo, calorías rápidas sin cantidad) y no se cierra', async () => {
    h.saveMealAsCombo.mockResolvedValue({
      ok: false,
      error: 'Esa comida no tiene alimentos con cantidad para guardar.',
    });
    const onClose = vi.fn();
    render(<SaveComboSheet meal="dinner" day="2026-03-15" onClose={onClose} />);
    fireEvent.click(dlg().getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(dlg().getByRole('alert').textContent).toContain('con cantidad'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cerrada no muestra nada', () => {
    render(<SaveComboSheet meal={null} day="2026-03-15" onClose={vi.fn()} />);
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});
