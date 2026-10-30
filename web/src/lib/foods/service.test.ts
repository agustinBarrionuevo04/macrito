import { describe, expect, it, vi } from 'vitest';
import { LOCAL_ENOUGH, RESULT_LIMIT, createFoodService, type FoodStore } from './service';
import { FoodSourceError, type CatalogFood } from './types';

let counter = 0;
const base = { kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 2 };

/** Alimento ya guardado (con id). */
const stored = (name: string, extra: Partial<CatalogFood> = {}): CatalogFood => ({
  id: `uuid-${(counter += 1)}`,
  source: 'off',
  sourceId: `s-${counter}`,
  name,
  per100g: base,
  portions: [],
  ...extra,
});

/** Resultado externo todavía sin guardar (id vacío). */
const fresh = (name: string, extra: Partial<CatalogFood> = {}): CatalogFood => ({
  ...stored(name, extra),
  id: '',
});

function setup(
  overrides: {
    local?: CatalogFood[];
    off?: () => Promise<CatalogFood[]>;
    usda?: (() => Promise<CatalogFood[]>) | null;
    save?: FoodStore['saveShared'];
    offBarcode?: () => Promise<CatalogFood | null>;
    findByBarcode?: () => Promise<CatalogFood | null>;
  } = {},
) {
  const saveShared = vi.fn<FoodStore['saveShared']>(
    overrides.save ??
      (async (foods) => foods.map((f, i) => ({ ...f, id: `saved-${f.name}-${i}` }))),
  );
  const store: FoodStore = {
    search: vi.fn(async () => overrides.local ?? []),
    findByBarcode: vi.fn(overrides.findByBarcode ?? (async () => null)),
    saveShared,
  };
  const off = {
    search: vi.fn(overrides.off ?? (async () => [])),
    getByBarcode: vi.fn(overrides.offBarcode ?? (async () => null)),
  };
  const usdaSearch = overrides.usda === undefined ? async () => [] : overrides.usda;
  const usda = usdaSearch ? { search: vi.fn(usdaSearch) } : null;
  return { service: createFoodService({ store, off, usda }), store, off, usda, saveShared };
}

describe('FoodService.search', () => {
  it('con suficientes coincidencias locales no consulta a OFF ni a USDA', async () => {
    const local = Array.from({ length: LOCAL_ENOUGH }, (_, i) => stored(`Leche ${i}`));
    const { service, off, usda, saveShared } = setup({ local });

    const { foods, degraded } = await service.search('leche');

    expect(foods).toHaveLength(LOCAL_ENOUGH);
    expect(degraded).toBe(false);
    expect(off.search).not.toHaveBeenCalled();
    expect(usda?.search).not.toHaveBeenCalled();
    expect(saveShared).not.toHaveBeenCalled();
  });

  it('con pocas coincidencias consulta a las dos fuentes, guarda lo que se muestra y devuelve ids reales', async () => {
    const { service, off, usda, saveShared } = setup({
      local: [stored('Leche entera favorita', { isFavorite: true })],
      off: async () => [fresh('Leche La Serenísima')],
      usda: async () => [fresh('Milk, whole', { source: 'usda' })],
    });

    const { foods } = await service.search('leche');

    expect(off.search).toHaveBeenCalledWith('leche');
    expect(usda?.search).toHaveBeenCalledWith('leche');
    expect(foods.map((f) => f.name)).toEqual([
      'Leche entera favorita',
      'Leche La Serenísima',
      'Milk, whole',
    ]);
    expect(foods.every((f) => f.id !== '')).toBe(true);
    expect(saveShared.mock.calls[0]![0].map((f) => f.name).sort()).toEqual([
      'Leche La Serenísima',
      'Milk, whole',
    ]);
  });

  it('no vuelve a guardar un resultado externo que ya estaba en el catálogo local', async () => {
    const { service, saveShared } = setup({
      local: [stored('Leche', { sourceId: '779', isFavorite: true })],
      off: async () => [fresh('Leche (copia remota)', { sourceId: '779' })],
    });
    const { foods } = await service.search('leche');
    expect(foods.map((f) => f.name)).toEqual(['Leche']);
    expect(saveShared).not.toHaveBeenCalled();
  });

  it('no consulta a USDA si no hay API key', async () => {
    const { service, off } = setup({ usda: null, off: async () => [fresh('Pan')] });
    const { foods, degraded } = await service.search('pan');
    expect(foods).toHaveLength(1);
    expect(degraded).toBe(false);
    expect(off.search).toHaveBeenCalled();
  });

  it('si una fuente falla devuelve lo de la otra y lo marca como degradado', async () => {
    const { service } = setup({
      off: async () => {
        throw new FoodSourceError('off', 'caído');
      },
      usda: async () => [fresh('Bread, white', { source: 'usda' })],
    });
    const { foods, degraded } = await service.search('bread');
    expect(foods.map((f) => f.name)).toEqual(['Bread, white']);
    expect(degraded).toBe(true);
  });

  it('si todas las fuentes fallan pero hay datos locales, los devuelve como degradado', async () => {
    const down = async () => {
      throw new FoodSourceError('off', 'caído');
    };
    const { service } = setup({ local: [stored('Arroz')], off: down, usda: down });
    const { foods, degraded } = await service.search('arroz');
    expect(foods.map((f) => f.name)).toEqual(['Arroz']);
    expect(degraded).toBe(true);
  });

  it('si todas las fuentes fallan y no hay nada local, lanza FoodSourceError', async () => {
    const down = async () => {
      throw new FoodSourceError('off', 'caído');
    };
    const { service } = setup({ off: down, usda: down });
    await expect(service.search('arroz')).rejects.toBeInstanceOf(FoodSourceError);
  });

  it('sin resultados en ninguna parte devuelve una lista vacía, no un error', async () => {
    const { service, saveShared } = setup();
    expect(await service.search('zzzz')).toEqual({ foods: [], degraded: false });
    expect(saveShared).not.toHaveBeenCalled();
  });

  it(`limita a ${RESULT_LIMIT} resultados y solo guarda los que entran`, async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      fresh(`Galletita ${String(i).padStart(2, '0')}`),
    );
    const { service, saveShared } = setup({ off: async () => many });
    const { foods } = await service.search('galletita');
    expect(foods).toHaveLength(RESULT_LIMIT);
    expect(saveShared.mock.calls[0]![0]).toHaveLength(RESULT_LIMIT);
  });

  it('omite lo que el catálogo no devolvió al guardar, sin romper el resto', async () => {
    const { service } = setup({
      off: async () => [fresh('A'), fresh('B')],
      save: async (foods) => foods.filter((f) => f.name === 'A').map((f) => ({ ...f, id: 'ok' })),
    });
    const { foods } = await service.search('x');
    expect(foods.map((f) => f.name)).toEqual(['A']);
  });

  it('propaga el error si falla el guardado', async () => {
    const { service } = setup({
      off: async () => [fresh('A')],
      save: async () => {
        throw new Error('db caída');
      },
    });
    await expect(service.search('a')).rejects.toThrow('db caída');
  });

  it('el resultado no expone datos internos', async () => {
    const { service } = setup({
      local: [stored('Leche', { isFavorite: true, score: 0.9, createdBy: null })],
    });
    const { foods } = await service.search('leche');
    expect(Object.keys(foods[0]!).sort()).toEqual(['id', 'name', 'per100g', 'portions', 'source']);
  });
});

describe('FoodService.barcode', () => {
  it('si está en el catálogo local no consulta a OFF', async () => {
    const { service, off } = setup({
      findByBarcode: async () => stored('Galletitas', { barcode: '7790070410108' }),
    });
    expect(await service.barcode('7790070410108')).toMatchObject({ name: 'Galletitas' });
    expect(off.getByBarcode).not.toHaveBeenCalled();
  });

  it('si no está, lo busca en OFF, lo guarda y devuelve el id real', async () => {
    const { service, off, saveShared } = setup({
      offBarcode: async () => fresh('Yerba', { barcode: '7790070410108' }),
    });
    const food = await service.barcode('7790070410108');
    expect(off.getByBarcode).toHaveBeenCalledWith('7790070410108');
    expect(food).toMatchObject({ name: 'Yerba', barcode: '7790070410108' });
    expect(food?.id).not.toBe('');
    expect(saveShared).toHaveBeenCalledTimes(1);
  });

  it('devuelve null si OFF no lo conoce, y no guarda nada', async () => {
    const { service, saveShared } = setup();
    expect(await service.barcode('7790070410108')).toBeNull();
    expect(saveShared).not.toHaveBeenCalled();
  });

  it('propaga el error de OFF para que la API responda 503', async () => {
    const { service } = setup({
      offBarcode: async () => {
        throw new FoodSourceError('off', 'caído');
      },
    });
    await expect(service.barcode('7790070410108')).rejects.toBeInstanceOf(FoodSourceError);
  });

  it('devuelve null si el guardado no devuelve filas', async () => {
    const { service } = setup({ offBarcode: async () => fresh('X'), save: async () => [] });
    expect(await service.barcode('7790070410108')).toBeNull();
  });
});
