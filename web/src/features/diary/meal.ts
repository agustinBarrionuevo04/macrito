import type { MealType } from '@/types';
import { MEAL_ORDER } from './types';

/** Comida sugerida según la hora local del dispositivo. */
export function defaultMealFor(now: Date): MealType {
  const hour = now.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 20) return 'snack';
  return 'dinner';
}

export function isMealType(value: unknown): value is MealType {
  return typeof value === 'string' && (MEAL_ORDER as readonly string[]).includes(value);
}
