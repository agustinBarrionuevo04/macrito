import type { Food } from '@/types';

/** Alimento del catálogo con los datos extra que usa el servidor para ordenar y guardar. */
export type CatalogFood = Food & {
  /** Identificador en la fuente (código de barras en OFF, fdcId en USDA, slug en ar_seed). */
  sourceId?: string;
  /** `null` o ausente = catálogo compartido; si no, id del usuario dueño. */
  createdBy?: string | null;
  /** Solo OFF: clave de popularidad (mayor = mejor). */
  popularity?: number;
  /** Solo OFF: vendido en Argentina. */
  argentina?: boolean;
  /** Solo búsqueda local, por usuario. */
  isFavorite?: boolean;
  lastUsedOn?: string | null;
  /** Relevancia textual 0–1 (búsqueda local). */
  score?: number;
};

/** Una fuente externa no respondió (caída, timeout, respuesta inválida). */
export class FoodSourceError extends Error {
  constructor(
    readonly source: 'off' | 'usda',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'FoodSourceError';
  }
}
