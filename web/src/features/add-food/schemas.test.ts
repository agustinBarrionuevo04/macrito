import { describe, expect, it } from 'vitest';
import { customFoodSchema } from './schemas';

const valid = { name: 'Alfajor', kcal: 450, protein_g: 5, carbs_g: 60, fat_g: 20 };

const message = (input: unknown) => {
  const result = customFoodSchema.safeParse(input);
  return result.success ? null : result.error.issues[0]?.message;
};

describe('customFoodSchema', () => {
  it('acepta lo mínimo y completa las porciones vacías', () => {
    expect(customFoodSchema.parse(valid)).toEqual({ ...valid, portions: [] });
  });

  it('recorta el nombre y trata marca y código vacíos como ausentes', () => {
    const parsed = customFoodSchema.parse({
      ...valid,
      name: '  Alfajor  ',
      brand: '  ',
      barcode: '',
    });
    expect(parsed.name).toBe('Alfajor');
    expect(parsed.brand).toBeUndefined();
    expect(parsed.barcode).toBeUndefined();
  });

  it('normaliza el código de barras (UPC-A pasa a EAN-13) y rechaza los inválidos', () => {
    expect(customFoodSchema.parse({ ...valid, barcode: '036000291452' }).barcode).toBe(
      '0036000291452',
    );
    expect(message({ ...valid, barcode: '1234567890123' })).toContain('código de barras');
    expect(message({ ...valid, barcode: 'abc' })).toContain('código de barras');
  });

  it('exige nombre', () => {
    expect(message({ ...valid, name: '   ' })).toContain('nombre');
    expect(message({ ...valid, name: 'x'.repeat(101) })).toContain('nombre');
    expect(message({ ...valid, name: undefined })).toContain('nombre');
  });

  it('valida kcal (0–900) y macros (0–100) por 100 g', () => {
    expect(message({ ...valid, kcal: 901 })).toContain('calorías');
    expect(message({ ...valid, kcal: -1 })).toContain('calorías');
    expect(message({ ...valid, kcal: Number.NaN })).toContain('calorías');
    expect(message({ ...valid, protein_g: 101 })).toContain('proteínas');
    expect(message({ ...valid, carbs_g: undefined })).toContain('proteínas');
    expect(customFoodSchema.safeParse({ ...valid, kcal: 0, protein_g: 0 }).success).toBe(true);
    expect(
      customFoodSchema.safeParse({ ...valid, kcal: 900, fat_g: 100, protein_g: 0, carbs_g: 0 })
        .success,
    ).toBe(true);
  });

  it('los macros no pueden sumar más de 105 g por 100 g', () => {
    expect(message({ ...valid, protein_g: 40, carbs_g: 40, fat_g: 40 })).toContain(
      'suman más de 100',
    );
    expect(
      customFoodSchema.safeParse({ ...valid, protein_g: 35, carbs_g: 35, fat_g: 35 }).success,
    ).toBe(true);
  });

  it('valida los opcionales solo si vienen', () => {
    expect(
      customFoodSchema.safeParse({ ...valid, fiber_g: 3, sugar_g: 10, sodium_mg: 200 }).success,
    ).toBe(true);
    expect(message({ ...valid, fiber_g: -1 })).toContain('opcional');
    expect(message({ ...valid, sodium_mg: 50_000 })).toContain('opcional');
  });

  it('valida las porciones', () => {
    expect(
      customFoodSchema.parse({ ...valid, portions: [{ label: ' 1 unidad ', grams: 50 }] }).portions,
    ).toEqual([{ label: '1 unidad', grams: 50 }]);
    expect(message({ ...valid, portions: [{ label: '', grams: 50 }] })).toContain('descripción');
    expect(message({ ...valid, portions: [{ label: 'x', grams: 0 }] })).toContain('gramos');
    expect(message({ ...valid, portions: [{ label: 'x', grams: 5001 }] })).toContain('gramos');
    expect(
      message({ ...valid, portions: Array.from({ length: 11 }, () => ({ label: 'x', grams: 1 })) }),
    ).toContain('hasta 10');
  });
});
