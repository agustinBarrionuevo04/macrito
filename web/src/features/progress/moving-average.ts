import { addDays } from '@/features/diary/dates';
import type { MovingAveragePoint, WeightPoint } from './types';

/**
 * Promedio móvil del peso (portado de `weight_moving_average.dart` de OpenNutriTracker). Cada punto
 * queda en el día de una lectura real, así la línea suavizada pasa por los puntos crudos, y su valor es
 * la media de todas las lecturas de los últimos `windowDays` días (incluido el propio día).
 *
 * Los puntos respaldados por menos de `minSamples` lecturas se descartan: la línea recién empieza
 * cuando el suavizado significa algo. Con dos lecturas el mismo día, ambas cuentan.
 */
export function movingAverage(
  readings: readonly WeightPoint[],
  windowDays = 7,
  minSamples = 2,
): MovingAveragePoint[] {
  if (windowDays < 2) throw new RangeError('windowDays debe ser al menos 2');
  if (minSamples < 1) throw new RangeError('minSamples debe ser positivo');

  // Las fechas ISO se ordenan como texto.
  const sorted = [...readings].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const points: MovingAveragePoint[] = [];
  let head = 0;
  let sum = 0;

  for (let anchor = 0; anchor < sorted.length; anchor++) {
    const current = sorted[anchor]!;
    const windowStart = addDays(current.day, -(windowDays - 1));
    // `head` va unos pasos atrás del ancla y descarta lo que quedó fuera de la ventana.
    while (head <= anchor && sorted[head]!.day < windowStart) {
      sum -= sorted[head]!.weightKg;
      head += 1;
    }
    sum += current.weightKg;
    const samples = anchor - head + 1;
    if (samples >= minSamples) {
      points.push({ day: current.day, weightKg: sum / samples, samples });
    }
  }
  return points;
}
