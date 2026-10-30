import { describe, expect, it } from 'vitest';
import { t } from './format';

describe('t', () => {
  it('reemplaza variables, también repetidas', () => {
    expect(t('Paso {a} de {b}', { a: 2, b: 8 })).toBe('Paso 2 de 8');
    expect(t('{x} y {x}', { x: 'uno' })).toBe('uno y uno');
  });

  it('deja intacto lo que no tiene valor y no toca llaves sin nombre', () => {
    expect(t('Hola {nombre}', {})).toBe('Hola {nombre}');
    expect(t('a { b } c', { b: 1 })).toBe('a { b } c');
  });

  it('acepta el 0', () => {
    expect(t('{n} kcal', { n: 0 })).toBe('0 kcal');
  });
});
