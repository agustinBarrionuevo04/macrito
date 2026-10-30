// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@/types';

const h = vi.hoisted(() => ({ searchFoods: vi.fn() }));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, searchFoods: h.searchFoods };
});

const { FoodPicker, SEARCH_DEBOUNCE_MS } = await import('./food-picker');
const { FoodsApiError } = await import('../api');

const food = (id: string, name: string, extra: Partial<Food> = {}): Food => ({
  id,
  source: 'off',
  name,
  per100g: { kcal: 200, protein_g: 10, carbs_g: 20, fat_g: 5 },
  portions: [],
  ...extra,
});

const props = (over: Partial<Parameters<typeof FoodPicker>[0]> = {}) => ({
  onSelect: vi.fn(),
  onToggleFavorite: vi.fn(),
  onCreate: vi.fn(),
  favoriteIds: new Set<string>(),
  favorites: [],
  recents: [],
  ...over,
});

const type = (text: string) =>
  fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: text } });
const flush = () => act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 10));

beforeEach(() => {
  vi.useFakeTimers();
  h.searchFoods.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FoodPicker', () => {
  it('sin texto muestra favoritos y recientes, y no busca', () => {
    render(
      <FoodPicker
        {...props({
          favorites: [food('f1', 'Leche')],
          recents: [food('r1', 'Pan')],
          favoriteIds: new Set(['f1']),
        })}
      />,
    );
    expect(screen.getByRole('region', { name: 'Favoritos' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Recientes' })).toBeTruthy();
    expect(h.searchFoods).not.toHaveBeenCalled();
  });

  it('sin favoritos ni recientes explica cómo empezar', () => {
    render(<FoodPicker {...props()} />);
    expect(screen.getByText(/Todavía no tenés favoritos/)).toBeTruthy();
  });

  it('con una sola letra avisa y no busca', async () => {
    render(<FoodPicker {...props()} />);
    type('m');
    await flush();
    expect(screen.getByText(/al menos 2 letras/)).toBeTruthy();
    expect(h.searchFoods).not.toHaveBeenCalled();
  });

  it('espera 300 ms sin escribir y busca una sola vez con el texto recortado', async () => {
    h.searchFoods.mockResolvedValue({ foods: [food('a', 'Milanesa')], degraded: false });
    render(<FoodPicker {...props()} />);
    type('mi');
    await act(() => vi.advanceTimersByTimeAsync(200));
    type('  milanesa ');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(h.searchFoods).not.toHaveBeenCalled();
    await flush();
    expect(h.searchFoods).toHaveBeenCalledTimes(1);
    expect(h.searchFoods.mock.calls[0]![0]).toBe('milanesa');
    expect(screen.getByRole('button', { name: 'Elegir Milanesa' })).toBeTruthy();
  });

  it('muestra el esqueleto mientras carga', async () => {
    h.searchFoods.mockReturnValue(new Promise(() => undefined));
    render(<FoodPicker {...props()} />);
    type('leche');
    await flush();
    expect(screen.getByRole('status', { name: 'Buscando…' })).toBeTruthy();
  });

  it('una respuesta lenta de una búsqueda vieja no pisa a la nueva', async () => {
    let resolveOld: (value: unknown) => void = () => undefined;
    h.searchFoods
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce({ foods: [food('n', 'Nueva')], degraded: false });
    render(<FoodPicker {...props()} />);
    type('vieja');
    await flush();
    type('nueva');
    await flush();
    await act(async () => resolveOld({ foods: [food('o', 'Vieja')], degraded: false }));
    expect(screen.getByRole('button', { name: 'Elegir Nueva' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Elegir Vieja' })).toBeNull();
  });

  it('sin resultados ofrece crear el alimento con lo escrito', async () => {
    h.searchFoods.mockResolvedValue({ foods: [], degraded: false });
    const p = props();
    render(<FoodPicker {...p} />);
    type('zzz');
    await flush();
    expect(screen.getByText('No encontramos "zzz".')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Crear "zzz"' }));
    expect(p.onCreate).toHaveBeenCalledWith('zzz');
  });

  it('un error muestra su mensaje y "Reintentar" vuelve a buscar', async () => {
    h.searchFoods
      .mockRejectedValueOnce(new FoodsApiError('sources_unavailable', 'No pudimos consultar.'))
      .mockResolvedValueOnce({ foods: [food('a', 'Leche')], degraded: false });
    render(<FoodPicker {...props()} />);
    type('leche');
    await flush();
    expect(screen.getByRole('alert').textContent).toBe('No pudimos consultar.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Elegir Leche' })).toBeTruthy();
    expect(h.searchFoods).toHaveBeenCalledTimes(2);
  });

  it('avisa si una fuente no respondió', async () => {
    h.searchFoods.mockResolvedValue({ foods: [food('a', 'Leche')], degraded: true });
    render(<FoodPicker {...props()} />);
    type('leche');
    await flush();
    expect(screen.getByText(/pueden estar incompletos|puede estar incompleta/)).toBeTruthy();
  });

  it('muestra la atribución de ARGENFOODS solo si hay resultados ar_seed', async () => {
    h.searchFoods.mockResolvedValue({
      foods: [food('a', 'Arroz', { source: 'ar_seed' })],
      degraded: false,
    });
    render(<FoodPicker {...props()} />);
    type('arroz');
    await flush();
    expect(screen.getByText(/ARGENFOODS/)).toBeTruthy();
    cleanup();
    h.searchFoods.mockResolvedValue({ foods: [food('b', 'Arroz OFF')], degraded: false });
    render(<FoodPicker {...props()} />);
    type('arroz');
    await flush();
    expect(screen.queryByText(/ARGENFOODS/)).toBeNull();
  });

  it('elegir llama a onSelect; la estrella alterna favorito sin elegir', async () => {
    h.searchFoods.mockResolvedValue({ foods: [food('a', 'Leche')], degraded: false });
    const p = props({ favoriteIds: new Set(['a']) });
    render(<FoodPicker {...p} />);
    type('leche');
    await flush();
    const star = screen.getByRole('button', { name: 'Quitar Leche de favoritos' });
    expect(star.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(star);
    expect(p.onToggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(p.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir Leche' }));
    expect(p.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('marca como "Propio" a los alimentos custom', () => {
    render(<FoodPicker {...props({ recents: [food('c', 'Mi pan', { source: 'custom' })] })} />);
    expect(screen.getByText('Propio')).toBeTruthy();
  });

  it('al borrar el texto vuelve a favoritos y recientes', async () => {
    h.searchFoods.mockResolvedValue({ foods: [food('a', 'Leche')], degraded: false });
    render(<FoodPicker {...props({ recents: [food('r', 'Pan')] })} />);
    type('leche');
    await flush();
    type('');
    await flush();
    expect(screen.getByRole('region', { name: 'Recientes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Elegir Leche' })).toBeNull();
  });
});
