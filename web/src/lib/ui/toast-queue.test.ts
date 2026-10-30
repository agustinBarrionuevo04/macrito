import { describe, expect, it } from 'vitest';
import { MAX_VISIBLE_TOASTS, addToast, removeToast } from './toast-queue';

const t = (id: number) => ({ id, message: `m${id}` });

describe('addToast', () => {
  it('agrega al final', () => {
    expect(addToast([t(1)], t(2)).map((x) => x.id)).toEqual([1, 2]);
  });

  it(`deja como mucho ${MAX_VISIBLE_TOASTS} y descarta el más viejo`, () => {
    const list = [t(1), t(2), t(3)];
    expect(addToast(list, t(4)).map((x) => x.id)).toEqual([2, 3, 4]);
    expect(addToast(list, t(4), 2).map((x) => x.id)).toEqual([3, 4]);
  });

  it('no modifica la lista original', () => {
    const list = [t(1)];
    addToast(list, t(2));
    expect(list).toHaveLength(1);
  });
});

describe('removeToast', () => {
  it('saca el toast pedido y no falla si no existe', () => {
    expect(removeToast([t(1), t(2)], 1).map((x) => x.id)).toEqual([2]);
    expect(removeToast([t(1)], 99)).toHaveLength(1);
  });
});
