import { describe, expect, it } from 'vitest';
import { fitWithin } from './resize';

describe('fitWithin', () => {
  it('reduce la foto grande conservando la proporción', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(2048, 2048)).toEqual({ width: 1024, height: 1024 });
  });

  it('no agranda las fotos chicas', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('nunca da una dimensión de 0 en una foto muy alargada', () => {
    expect(fitWithin(10_000, 1)).toEqual({ width: 1024, height: 1 });
  });

  it('dimensiones inválidas dan 0', () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(Number.NaN, 10)).toEqual({ width: 0, height: 0 });
  });

  it('respeta un lado máximo distinto', () => {
    expect(fitWithin(1000, 500, 100)).toEqual({ width: 100, height: 50 });
  });
});
