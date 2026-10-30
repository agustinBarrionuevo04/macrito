export type SwipeDirection = 'right' | 'left';

/** Distancia mínima (px) para contar como deslizamiento. */
export const SWIPE_MIN_DISTANCE = 60;

/**
 * Dirección de un gesto de dedo, o `null` si no cuenta como deslizamiento horizontal: tiene que
 * ser largo y más horizontal que vertical (para no confundirlo con scrollear la página).
 */
export function swipeDirection(dx: number, dy: number): SwipeDirection | null {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(dx) < Math.abs(dy) * 2) return null;
  return dx > 0 ? 'right' : 'left';
}
