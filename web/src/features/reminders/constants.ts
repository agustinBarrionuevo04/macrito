import { MEAL_ORDER } from '@/features/diary/types';
import type { MealType } from '@/types';

export const REMINDER_MEALS: readonly MealType[] = MEAL_ORDER;

/** Horas sugeridas (locales) al activar un recordatorio por primera vez. */
export const DEFAULT_REMINDER_TIMES: Record<MealType, string> = {
  breakfast: '09:00',
  lunch: '13:00',
  snack: '17:30',
  dinner: '21:00',
};

/**
 * Cuánto después de la hora todavía se envía. La tarea programada corre cada tanto y puede
 * atrasarse; pasada la ventana, avisar "es hora del almuerzo" a las 18 ya no sirve.
 */
export const REMINDER_WINDOW_MINUTES = 90;
