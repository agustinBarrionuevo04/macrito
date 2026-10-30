import { describe, expect, it } from 'vitest';
import { describeShape, extractJsonValue } from './extract';

describe('extractJsonValue', () => {
  it('lee JSON directo (objeto o lista)', () => {
    expect(extractJsonValue('{"items":[{"query":"pan"}]}')).toEqual({ items: [{ query: 'pan' }] });
    expect(extractJsonValue(' [1, 2] ')).toEqual([1, 2]);
  });

  it('lee un bloque con cercas, con o sin "json"', () => {
    expect(extractJsonValue('Acá va:\n```json\n{"items": []}\n```\nListo.')).toEqual({ items: [] });
    expect(extractJsonValue('```\n[{"query":"a"}]\n```')).toEqual([{ query: 'a' }]);
  });

  it('encuentra el JSON rodeado de texto', () => {
    expect(
      extractJsonValue('Claro, el resultado es {"items":[{"query":"leche"}]} espero que sirva'),
    ).toEqual({
      items: [{ query: 'leche' }],
    });
  });

  it('respeta llaves y corchetes dentro de textos entre comillas', () => {
    expect(extractJsonValue('x {"items":[{"query":"pan } con [queso"}]} y')).toEqual({
      items: [{ query: 'pan } con [queso' }],
    });
    expect(extractJsonValue('{"a":"comilla \\" y } dentro"}')).toEqual({
      a: 'comilla " y } dentro',
    });
  });

  it('salta un primer candidato roto y toma el siguiente', () => {
    expect(extractJsonValue('mira {esto no es json} pero {"items":[]}')).toEqual({ items: [] });
  });

  it('devuelve undefined si no hay nada legible', () => {
    for (const text of ['', '   ', 'solo texto', '{"abierto": ', '[1, 2', '42', '"hola"', 'null']) {
      expect(extractJsonValue(text), text).toBeUndefined();
    }
  });
});

describe('describeShape', () => {
  it('muestra la estructura y no el contenido', () => {
    const shape = describeShape({
      items: [{ query: 'milanesa de pollo', est_grams: 200 }],
      nota: 'hola',
    });
    expect(shape).toBe(
      '{items: array(1 de {query: string(17), est_grams: number}), nota: string(4)}',
    );
    expect(shape).not.toContain('milanesa');
    expect(shape).not.toContain('hola');
  });

  it('cubre null, vacíos, profundidad y tipos simples', () => {
    expect(describeShape(null)).toBe('null');
    expect(describeShape([])).toBe('array(0)');
    expect(describeShape(undefined)).toBe('undefined');
    expect(describeShape(true)).toBe('boolean');
    expect(describeShape({ a: { b: { c: { d: 1 } } } })).toBe('{a: {b: {c: object}}}');
  });

  it('limita la cantidad de claves', () => {
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 1]));
    expect(describeShape(many).split(',').length).toBe(8);
  });
});
