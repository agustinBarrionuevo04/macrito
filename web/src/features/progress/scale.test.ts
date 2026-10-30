import { describe, expect, it } from 'vitest';
import { columnPath, labelIndexes, linearScale, niceTicks } from './scale';

describe('linearScale', () => {
  it('mapea el dominio al rango (también invertido)', () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });
  it('un dominio de un solo valor cae en el medio', () => {
    expect(linearScale([5, 5], [0, 100])(5)).toBe(50);
  });
});

describe('niceTicks', () => {
  it('marcas redondas que cubren el dominio', () => {
    expect(niceTicks(78.3, 81.9)).toEqual({
      ticks: [78, 79, 80, 81, 82],
      min: 78,
      max: 82,
      decimals: 0,
    });
    expect(niceTicks(0, 2300)).toEqual({
      ticks: [0, 1000, 2000, 3000],
      min: 0,
      max: 3000,
      decimals: 0,
    });
    expect(niceTicks(0, 100)).toMatchObject({ min: 0, max: 100 });
  });
  it('con un solo valor abre un margen', () => {
    const { ticks, min, max } = niceTicks(80, 80);
    expect(min).toBeLessThan(80);
    expect(max).toBeGreaterThan(80);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    const zero = niceTicks(0, 0);
    expect(zero.min).toBeLessThan(0);
    expect(zero.max).toBeGreaterThan(0);
  });
  it('no produce ruido de punto flotante', () => {
    for (const tick of niceTicks(0.1, 0.7).ticks) expect(String(tick).length).toBeLessThan(6);
  });
  it('siempre incluye los extremos pedidos', () => {
    for (const [lo, hi] of [
      [1234, 5678],
      [0, 1],
      [79.95, 80.05],
      [-3, 12],
    ] as const) {
      const { min, max } = niceTicks(lo, hi);
      expect(min).toBeLessThanOrEqual(lo);
      expect(max).toBeGreaterThanOrEqual(hi);
    }
  });
});

describe('niceTicks: decimales', () => {
  it('pasos menores a 1 piden decimales para no repetir marcas al redondear', () => {
    const narrow = niceTicks(80.3, 80.9); // paso 0,2
    expect(narrow.decimals).toBe(1);
    const shown = narrow.ticks.map((tick) => tick.toFixed(narrow.decimals));
    expect(new Set(shown).size).toBe(shown.length);
    expect(niceTicks(80.05, 80.12).decimals).toBe(2);
    expect(niceTicks(0, 100).decimals).toBe(0);
  });
  it('nunca usa el paso 2,5 (daría marcas como 80,25 que se muestran repetidas)', () => {
    for (const [lo, hi] of [
      [80, 81],
      [0, 25],
      [79.5, 82],
    ] as const) {
      const { ticks } = niceTicks(lo, hi);
      const steps = ticks.slice(1).map((tick, i) => Math.round((tick - ticks[i]!) * 1e6) / 1e6);
      for (const step of steps) expect(String(step)).toMatch(/^(0\.0*[125]|[125]0*)$/);
    }
  });
});

describe('columnPath', () => {
  it('dibuja una columna con la base recta y las puntas redondeadas', () => {
    expect(columnPath(10, 100, 20, 50)).toBe('M10,100 V54 Q10,50 14,50 H26 Q30,50 30,54 V100 Z');
  });
  it('el radio no pasa de la mitad del ancho ni de la altura', () => {
    expect(columnPath(0, 10, 6, 50)).toContain('Q0,-40 3,-40');
    expect(columnPath(0, 10, 20, 2)).toContain('Q0,8 2,8');
  });
  it('sin alto o sin ancho no dibuja nada', () => {
    expect(columnPath(0, 10, 20, 0)).toBe('');
    expect(columnPath(0, 10, 0, 5)).toBe('');
  });
});

describe('labelIndexes', () => {
  it('con pocos puntos rotula todos', () => {
    expect(labelIndexes(3)).toEqual([0, 1, 2]);
    expect(labelIndexes(0)).toEqual([]);
  });
  it('con muchos rotula el primero, el último y pocos en el medio', () => {
    expect(labelIndexes(31)).toEqual([0, 10, 20, 30]);
    expect(labelIndexes(7)).toEqual([0, 2, 4, 6]);
    expect(labelIndexes(7, 3)).toEqual([0, 3, 6]);
  });
});
