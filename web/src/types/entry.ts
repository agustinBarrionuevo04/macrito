import type { Food, MealType, Origin } from './food';

export type EntryDraft = {
  food: Food;
  quantity_g: number;
  meal_type: MealType;
  origin: Origin;
  is_estimate: boolean;
};
