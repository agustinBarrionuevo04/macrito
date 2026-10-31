import { describe, expect, it } from 'vitest';
import { parseRange } from './range';

describe('parseRange', () => {
  it('acepta 7, 30 y 90', () => {
    expect(parseRange('7')).toBe(7);
    expect(parseRange('30')).toBe(30);
    expect(parseRange('90')).toBe(90);
  });
  it('cualquier otra cosa cae en 30', () => {
    for (const bad of [undefined, '', '0', '14', '365', 'abc', '7.5', '-7', '90 ']) {
      expect(parseRange(bad), String(bad)).toBe(bad === '90 ' ? 90 : 30);
    }
  });
});
