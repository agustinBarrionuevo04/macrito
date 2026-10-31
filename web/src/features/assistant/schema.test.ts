import { describe, expect, it } from 'vitest';
import { MAX_ITEMS_PER_OPTION, MAX_OPTIONS, PLAN_TOOL, parsePlanOptions } from './schema';

const option = (extra: object = {}) => ({
  title: 'Milanesa con ensalada',
  meal: 'dinner',
  items: [
    { query: 'milanesa de pollo', grams: 150 },
    { query: 'ensalada de lechuga y tomate', grams: 200 },
  ],
  ...extra,
});

describe('PLAN_TOOL', () => {
  it('no le pide al modelo calorías ni macros: solo alimentos y gramos', () => {
    const json = JSON.stringify(PLAN_TOOL.schema);
    expect(json).not.toMatch(/kcal|protein|carbs|fat/);
    expect(json).toContain('grams');
  });
});

describe('parsePlanOptions', () => {
  it('lee la forma esperada', () => {
    expect(parsePlanOptions({ options: [option()] })).toEqual([
      {
        title: 'Milanesa con ensalada',
        meal: 'dinner',
        items: [
          { query: 'milanesa de pollo', grams: 150 },
          { query: 'ensalada de lechuga y tomate', grams: 200 },
        ],
      },
    ]);
  });

  it('tolera nombres de campos alternativos, una lista suelta y números como texto', () => {
    const loose = [
      {
        nombre: ' Pollo con arroz ',
        alimentos: [
          { nombre: 'pechuga de pollo', gramos: '180' },
          { food: 'arroz cocido', g: 150.456 },
        ],
      },
    ];
    expect(parsePlanOptions(loose)).toEqual([
      {
        title: 'Pollo con arroz',
        meal: null,
        items: [
          { query: 'pechuga de pollo', grams: 180 },
          { query: 'arroz cocido', grams: 150.46 },
        ],
      },
    ]);
    expect(parsePlanOptions({ opciones: [option()] })).toHaveLength(1);
  });

  it('pone un título por defecto y descarta una comida inválida', () => {
    const [parsed] = parsePlanOptions({ options: [option({ title: '  ', meal: 'brunch' })] });
    expect(parsed).toMatchObject({ title: 'Opción 1', meal: null });
  });

  it('descarta la opción entera si un alimento no se puede leer (no la subestima en silencio)', () => {
    const broken = option({
      items: [
        { query: 'pollo', grams: 150 },
        { query: 'arroz', grams: -5 },
      ],
    });
    expect(parsePlanOptions({ options: [broken, option()] })).toHaveLength(1);
  });

  it('rechaza gramos imposibles, nombres vacíos o larguísimos y opciones sin alimentos', () => {
    const bad = [
      option({ items: [{ query: 'pollo', grams: 0 }] }),
      option({ items: [{ query: 'pollo', grams: 50_000 }] }),
      option({ items: [{ query: 'x', grams: 100 }] }),
      option({ items: [{ query: 'a'.repeat(200), grams: 100 }] }),
      option({ items: [] }),
      option({ items: 'pollo' }),
    ];
    for (const entry of bad) {
      expect(() => parsePlanOptions({ options: [entry] })).toThrow(/ninguna opción es válida/);
    }
  });

  it('limita la cantidad de opciones y de alimentos por opción', () => {
    const many = Array.from({ length: 9 }, () => option());
    expect(parsePlanOptions({ options: many })).toHaveLength(MAX_OPTIONS);
    const long = option({
      items: Array.from({ length: MAX_ITEMS_PER_OPTION + 3 }, (_, i) => ({
        query: `alimento ${i}`,
        grams: 10,
      })),
    });
    expect(parsePlanOptions({ options: [long] })[0]!.items).toHaveLength(MAX_ITEMS_PER_OPTION);
  });

  it('lanza bad_response si no hay lista de opciones', () => {
    for (const raw of [
      null,
      'hola',
      42,
      {},
      { options: 'x' },
      { options: [] },
      { options: [null, 3] },
    ]) {
      expect(() => parsePlanOptions(raw), JSON.stringify(raw)).toThrowError(
        expect.objectContaining({ code: 'bad_response' }),
      );
    }
  });
});
