/** Totales de un día con registros (lo que devuelve `daily_totals`). */
export type DayTotals = {
  day: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  entries: number;
};

export type WeightPoint = { day: string; weightKg: number };

export type MovingAveragePoint = {
  day: string;
  weightKg: number;
  /** Cuántas lecturas entraron en el promedio de ese punto. */
  samples: number;
};

/** Metas diarias contra las que se compara (las actuales del perfil). */
export type Targets = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
