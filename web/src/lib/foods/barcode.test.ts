import { describe, expect, it } from 'vitest';
import { normalizeBarcode } from './barcode';

describe('normalizeBarcode', () => {
  it('acepta EAN-13 válidos (incluido uno argentino, prefijo 779)', () => {
    expect(normalizeBarcode('4006381333931')).toBe('4006381333931');
    expect(normalizeBarcode('7790070410108')).toBe('7790070410108');
    expect(normalizeBarcode('7791234567898')).toBe('7791234567898');
  });

  it('acepta EAN-8 y GTIN-14', () => {
    expect(normalizeBarcode('96385074')).toBe('96385074');
    expect(normalizeBarcode('10614141000415')).toBe('10614141000415');
  });

  it('lleva UPC-A (12 dígitos) a EAN-13 con un 0 adelante', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
  });

  it('un GTIN-14 que empieza con 0 equivale al EAN-13', () => {
    expect(normalizeBarcode('04006381333931')).toBe('4006381333931');
  });

  it('ignora espacios y guiones', () => {
    expect(normalizeBarcode(' 779 0070-410108 ')).toBe('7790070410108');
  });

  it('rechaza un dígito verificador incorrecto (error de tipeo)', () => {
    expect(normalizeBarcode('7790070410105')).toBeNull();
    expect(normalizeBarcode('96385075')).toBeNull();
  });

  it('rechaza largos inválidos y caracteres que no son dígitos', () => {
    for (const bad of [
      '',
      '123',
      '1234567',
      '123456789',
      '12345678901234567',
      'abcdefgh',
      '7790070410108x',
      '779007041010.8',
    ]) {
      expect(normalizeBarcode(bad), bad).toBeNull();
    }
  });
});
