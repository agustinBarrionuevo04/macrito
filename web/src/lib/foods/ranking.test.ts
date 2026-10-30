import { describe, expect, it } from 'vitest';
import { dedupeFoods, rankFoods, textScore, toFood } from './ranking';
import type { CatalogFood } from './types';

let nextId = 0;
const food = (overrides: Partial<CatalogFood> & { name: string }): CatalogFood => ({
  id: `id-${(nextId += 1)}`,
  source: 'off',
  per100g: { kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 },
  portions: [],
  ...overrides,
});

const names = (list: CatalogFood[]) => list.map((f) => f.name);

describe('textScore', () => {
  it('prefijo 0.9, contiene 0.6, palabras sueltas hasta 0.5', () => {
    expect(textScore('Milanesa de carne', 'milanesa')).toBe(0.9);
    expect(textScore('Empanada de milanesa', 'milanesa')).toBe(0.6);
    expect(textScore('Carne para milanesa', 'milanesa de carne')).toBeCloseTo(0.333, 2);
    expect(textScore('Leche', 'milanesa')).toBe(0);
  });

  it('ignora acentos y mayúsculas', () => {
    expect(textScore('CAFÉ molido', 'cafe')).toBe(0.9);
    expect(textScore('Café', 'CAFÉ')).toBe(0.9);
  });

  it('una consulta vacía no puntúa', () => {
    expect(textScore('Leche', '  ')).toBe(0);
  });
});

describe('rankFoods — favoritos y recientes → ar_seed → resto', () => {
  it('respeta los tres grupos aunque el texto del resto sea mejor', () => {
    const list = [
      food({ name: 'Milanesa genérica OFF', source: 'off' }),
      food({ name: 'Milanesa de carne', source: 'ar_seed' }),
      food({ name: 'Empanada de milanesa', source: 'ar_seed', score: 0.2 }),
      food({ name: 'Mi milanesa', source: 'custom', createdBy: 'u1' }),
      food({ name: 'Milanesa favorita', source: 'off', isFavorite: true, score: 0.1 }),
      food({ name: 'Milanesa de ayer', source: 'off', lastUsedOn: '2026-01-09', score: 0.1 }),
    ];
    const ranked = names(rankFoods(list, 'milanesa', 10));

    expect(ranked.slice(0, 2)).toEqual(['Milanesa favorita', 'Milanesa de ayer']);
    expect(ranked.slice(2, 5).sort()).toEqual(
      ['Empanada de milanesa', 'Milanesa de carne', 'Mi milanesa'].sort(),
    );
    expect(ranked[5]).toBe('Milanesa genérica OFF');
  });

  it('dentro de favoritos/recientes: más relevante, después favorito, después más reciente', () => {
    const list = [
      food({ name: 'A reciente viejo', lastUsedOn: '2026-01-01', score: 0.5 }),
      food({ name: 'B reciente nuevo', lastUsedOn: '2026-02-01', score: 0.5 }),
      food({ name: 'C favorito', isFavorite: true, score: 0.5 }),
      food({ name: 'D muy relevante', lastUsedOn: '2025-01-01', score: 0.9 }),
    ];
    expect(names(rankFoods(list, 'x', 10))).toEqual([
      'D muy relevante',
      'C favorito',
      'B reciente nuevo',
      'A reciente viejo',
    ]);
  });

  it('en el resto: relevancia, después vendido en Argentina, después popularidad', () => {
    const list = [
      food({ name: 'Leche popular', score: 0.6, popularity: 900 }),
      food({ name: 'Leche argentina', score: 0.6, argentina: true, popularity: 10 }),
      food({ name: 'Leche muy relevante', score: 0.9 }),
      food({ name: 'Leche poco popular', score: 0.6, popularity: 5 }),
    ];
    expect(names(rankFoods(list, 'leche', 10))).toEqual([
      'Leche muy relevante',
      'Leche argentina',
      'Leche popular',
      'Leche poco popular',
    ]);
  });

  it('desempata por nombre y respeta el límite', () => {
    const list = [
      food({ name: 'Zapallo', score: 0.5 }),
      food({ name: 'Arroz', score: 0.5 }),
      food({ name: 'Maíz', score: 0.5 }),
    ];
    expect(names(rankFoods(list, 'x', 2))).toEqual(['Arroz', 'Maíz']);
  });

  it('calcula la relevancia de los resultados que no la traen', () => {
    const list = [food({ name: 'Pan de leche' }), food({ name: 'Leche entera' })];
    expect(names(rankFoods(list, 'leche', 10))).toEqual(['Leche entera', 'Pan de leche']);
  });

  it('no modifica la lista original', () => {
    const list = [food({ name: 'B' }), food({ name: 'A' })];
    const copy = [...list];
    rankFoods(list, 'x', 10);
    expect(list).toEqual(copy);
  });
});

describe('dedupeFoods', () => {
  it('gana la primera aparición y distingue por fuente e id de fuente', () => {
    const local = food({ name: 'Local', source: 'off', sourceId: '1', isFavorite: true });
    const remoteSame = food({ id: '', name: 'Remoto', source: 'off', sourceId: '1' });
    const usda = food({ id: '', name: 'USDA', source: 'usda', sourceId: '1' });
    expect(names(dedupeFoods([local], [remoteSame, usda]))).toEqual(['Local', 'USDA']);
  });

  it('los alimentos sin sourceId se distinguen por id', () => {
    const a = food({ name: 'A', source: 'custom' });
    const b = food({ name: 'B', source: 'custom' });
    expect(dedupeFoods([a, b, a])).toHaveLength(2);
  });
});

describe('toFood', () => {
  it('deja solo el contrato Food', () => {
    const result = toFood(
      food({
        id: 'x',
        name: 'Leche',
        brand: 'Marca',
        barcode: '123',
        sourceId: '123',
        popularity: 5,
        isFavorite: true,
        score: 0.9,
        createdBy: 'u',
      }),
    );
    expect(result).toEqual({
      id: 'x',
      source: 'off',
      name: 'Leche',
      brand: 'Marca',
      barcode: '123',
      per100g: { kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 },
      portions: [],
    });
  });

  it('omite brand y barcode si no hay', () => {
    const result = toFood(food({ name: 'Arroz' }));
    expect(result).not.toHaveProperty('brand');
    expect(result).not.toHaveProperty('barcode');
  });
});
