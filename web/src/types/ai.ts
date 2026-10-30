export type Confidence = 'low' | 'med' | 'high';

export type PhotoItem = {
  /** Nombre del alimento en español, para buscar en `/api/foods/search`. */
  query: string;
  est_grams: number | null;
  count?: number;
  confidence: Confidence;
};

export type PhotoResult = { items: PhotoItem[] };
