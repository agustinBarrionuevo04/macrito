import { describe, expect, it } from 'vitest';
import { cx } from './cx';

describe('cx', () => {
  it('une clases e ignora valores falsos', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
    expect(cx()).toBe('');
  });
});
