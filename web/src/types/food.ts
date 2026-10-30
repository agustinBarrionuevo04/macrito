export type FoodSource = 'off' | 'usda' | 'ar_seed' | 'custom' | 'ai_unverified';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type Origin = 'manual' | 'barcode' | 'search' | 'ai_photo' | 'ai_text' | 'recipe' | 'copy';

export type Nutrients = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
};

export type Portion = { label: string; grams: number };

export type Food = {
  id: string;
  source: FoodSource;
  name: string;
  brand?: string;
  barcode?: string;
  per100g: Nutrients;
  portions: Portion[];
};
