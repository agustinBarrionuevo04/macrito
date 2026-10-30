import { describe, expect, it } from 'vitest';
import { isNavActive } from './nav';

describe('isNavActive', () => {
  it('"/" solo coincide exacto', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/add', '/')).toBe(false);
  });

  it('el resto coincide por segmento, no por prefijo de texto', () => {
    expect(isNavActive('/add', '/add')).toBe(true);
    expect(isNavActive('/add/barcode', '/add')).toBe(true);
    expect(isNavActive('/address', '/add')).toBe(false);
    expect(isNavActive('/progress', '/profile')).toBe(false);
  });
});
