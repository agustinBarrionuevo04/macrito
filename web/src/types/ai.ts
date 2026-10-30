export type Confidence = 'low' | 'med' | 'high';

export type PhotoItem = {
  /** Nombre del alimento en español, para buscar en `/api/foods/search`. */
  query: string;
  est_grams: number | null;
  count?: number;
  confidence: Confidence;
  /**
   * Macros por 100 g que supone el modelo. Solo se usan si el alimento no está en la base: entonces se
   * crea un alimento `ai_unverified` marcado como tal. Nunca pisan datos de la base.
   */
  per100g_guess?: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
};

export type PhotoResult = { items: PhotoItem[] };
