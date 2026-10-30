/** Rangos que se pueden ver, en días. */
export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = 30;

/** Ventana del promedio móvil del peso, en días (incluye el día de la lectura). */
export const WEIGHT_WINDOW_DAYS = 7;

/**
 * Un día cuenta como "dentro de la meta" si las kcal registradas están a ±10 % de la meta.
 * Es una definición nuestra (el plan no fija una): se ve igual para comer de más que de menos.
 */
export const ADHERENCE_TOLERANCE = 0.1;

/** Días de historia que se cargan siempre: alcanza para el rango más largo y para la racha. */
export const HISTORY_DAYS = 90;

/** Días atrás que se piden de pesos para que el promedio móvil tenga ventana desde el primer día. */
export const WEIGHT_LOOKBACK_DAYS = WEIGHT_WINDOW_DAYS - 1;
