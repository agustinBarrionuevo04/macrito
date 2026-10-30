import { describe, expect, it } from 'vitest';
import { normalizeOffProduct } from './normalize-off';

const base = {
  code: '7790070410105',
  product_name: 'Leche entera',
  brands: 'La Serenísima, Mastellone',
  countries_tags: ['en:argentina'],
  popularity_key: 123456,
  serving_quantity: 200,
  serving_size: '1 vaso (200 ml)',
  nutriments: {
    'energy-kcal_100g': 62,
    proteins_100g: 3.1,
    carbohydrates_100g: 4.7,
    fat_100g: 3.3,
    fiber_100g: 0,
    sugars_100g: 4.7,
    sodium_100g: 0.045,
  },
};

describe('normalizeOffProduct', () => {
  it('normaliza un producto completo', () => {
    expect(normalizeOffProduct(base)).toEqual({
      id: '',
      source: 'off',
      sourceId: '7790070410105',
      barcode: '7790070410105',
      name: 'Leche entera',
      brand: 'La Serenísima',
      per100g: {
        kcal: 62,
        protein_g: 3.1,
        carbs_g: 4.7,
        fat_g: 3.3,
        fiber_g: 0,
        sugar_g: 4.7,
        sodium_mg: 45,
      },
      portions: [{ label: '1 vaso (200 ml)', grams: 200 }],
      argentina: true,
      popularity: 123456,
    });
  });

  it('lee la marca de Search-a-licious, que la manda como lista', () => {
    // Forma real de https://search.openfoodfacts.org/search (verificada el 2026-10-30).
    expect(normalizeOffProduct({ ...base, brands: ['Lapataia', 'Otra'] })?.brand).toBe('Lapataia');
    expect(normalizeOffProduct({ ...base, brands: ['', '  ', 'Mardel'] })?.brand).toBe('Mardel');
    expect(normalizeOffProduct({ ...base, brands: [] })).not.toHaveProperty('brand');
    expect(normalizeOffProduct({ ...base, brands: [3, null] })).not.toHaveProperty('brand');
  });

  it('prefiere el nombre en español, después el genérico y después inglés', () => {
    expect(normalizeOffProduct({ ...base, product_name_es: 'Leche entera ES' })?.name).toBe(
      'Leche entera ES',
    );
    expect(
      normalizeOffProduct({ ...base, product_name: '', product_name_en: 'Whole milk' })?.name,
    ).toBe('Whole milk');
  });

  it('acepta números como strings (OFF los mezcla)', () => {
    const p = normalizeOffProduct({
      ...base,
      nutriments: {
        'energy-kcal_100g': '62',
        proteins_100g: '3,1',
        carbohydrates_100g: '4.7',
        fat_100g: '3.3',
      },
    });
    expect(p?.per100g).toEqual({ kcal: 62, protein_g: 3.1, carbs_g: 4.7, fat_g: 3.3 });
  });

  it('si no hay kcal usa kJ ÷ 4.184', () => {
    const p = normalizeOffProduct({
      ...base,
      nutriments: { energy_100g: 1046, proteins_100g: 1, carbohydrates_100g: 60, fat_100g: 1 },
    });
    expect(p?.per100g.kcal).toBe(250);
  });

  it('si no hay sodio usa sal ÷ 2.5', () => {
    const p = normalizeOffProduct({
      ...base,
      nutriments: { ...base.nutriments, sodium_100g: undefined, salt_100g: 1.25 },
    });
    expect(p?.per100g.sodium_mg).toBe(500);
  });

  it('descarta productos sin kcal o sin algún macro', () => {
    const noEnergy = Object.fromEntries(
      Object.entries(base.nutriments).filter(([key]) => key !== 'energy-kcal_100g'),
    );
    expect(normalizeOffProduct({ ...base, nutriments: noEnergy })).toBeNull();
    expect(
      normalizeOffProduct({ ...base, nutriments: { ...base.nutriments, fat_100g: undefined } }),
    ).toBeNull();
    expect(
      normalizeOffProduct({ ...base, nutriments: { ...base.nutriments, proteins_100g: 'n/a' } }),
    ).toBeNull();
  });

  it('descarta valores imposibles', () => {
    const bad = (n: Record<string, unknown>) =>
      normalizeOffProduct({ ...base, nutriments: { ...base.nutriments, ...n } });
    expect(bad({ 'energy-kcal_100g': 4000 })).toBeNull(); // 1000× (kJ cargado como kcal)
    expect(bad({ 'energy-kcal_100g': -5 })).toBeNull();
    expect(bad({ fat_100g: 120 })).toBeNull();
    expect(bad({ proteins_100g: 50, carbohydrates_100g: 50, fat_100g: 50 })).toBeNull();
  });

  it('acepta kcal 0 (agua, café) y un producto sin porción ni marca', () => {
    const p = normalizeOffProduct({
      code: '7791234567890',
      product_name: 'Agua mineral',
      nutriments: { 'energy-kcal_100g': 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
    });
    expect(p).toMatchObject({ name: 'Agua mineral', portions: [], argentina: false });
    expect(p).not.toHaveProperty('brand');
    expect(p).not.toHaveProperty('popularity');
  });

  it('exige código numérico y nombre', () => {
    expect(normalizeOffProduct({ ...base, code: '' })).toBeNull();
    expect(normalizeOffProduct({ ...base, code: 'abc' })).toBeNull();
    expect(normalizeOffProduct({ ...base, product_name: '   ' })).toBeNull();
  });

  it('ignora porciones inválidas y omite campos opcionales negativos', () => {
    const p = normalizeOffProduct({
      ...base,
      serving_quantity: 0,
      nutriments: {
        ...base.nutriments,
        fiber_100g: -1,
        sugars_100g: undefined,
        sodium_100g: undefined,
      },
    });
    expect(p?.portions).toEqual([]);
    expect(p?.per100g).not.toHaveProperty('fiber_g');
    expect(p?.per100g).not.toHaveProperty('sugar_g');
    expect(normalizeOffProduct({ ...base, serving_quantity: 5000 })?.portions).toEqual([]);
  });

  it('usa "1 porción" si no hay serving_size', () => {
    expect(normalizeOffProduct({ ...base, serving_size: undefined })?.portions).toEqual([
      { label: '1 porción', grams: 200 },
    ]);
  });

  it('rechaza lo que no es un objeto', () => {
    for (const bad of [null, undefined, 'x', 3, [], { code: '1234' }]) {
      expect(normalizeOffProduct(bad)).toBeNull();
    }
  });
});
