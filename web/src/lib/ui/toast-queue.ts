export const MAX_VISIBLE_TOASTS = 3;

/** Agrega un toast; quedan como mucho `max` visibles y se descarta el más viejo. */
export function addToast<T extends { id: number }>(
  list: T[],
  toast: T,
  max = MAX_VISIBLE_TOASTS,
): T[] {
  return [...list, toast].slice(-max);
}

export function removeToast<T extends { id: number }>(list: T[], id: number): T[] {
  return list.filter((toast) => toast.id !== id);
}
