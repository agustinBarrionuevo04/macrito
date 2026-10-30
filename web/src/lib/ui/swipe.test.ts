import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe';

describe('swipeDirection', () => {
  it('detecta deslizamientos horizontales largos', () => {
    expect(swipeDirection(120, 5)).toBe('right');
    expect(swipeDirection(-120, -5)).toBe('left');
  });

  it('ignora gestos cortos', () => {
    expect(swipeDirection(59, 0)).toBeNull();
    expect(swipeDirection(-30, 0)).toBeNull();
    expect(swipeDirection(60, 0)).toBe('right');
  });

  it('ignora el scroll vertical y los gestos diagonales', () => {
    expect(swipeDirection(70, 200)).toBeNull();
    expect(swipeDirection(80, 50)).toBeNull();
    expect(swipeDirection(100, 50)).toBe('right');
  });
});
