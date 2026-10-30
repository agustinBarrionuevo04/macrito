/** Conversiones de unidades. Los valores guardados son siempre kcal, kg, cm, g y ml. */

export const KCAL_TO_KJ = 4.184;
const CM_PER_INCH = 2.54;
const LB_PER_KG = 2.20462;
const G_PER_OZ = 28.3495;
const ML_PER_FL_OZ = 29.5735;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export const kcalToKj = (kcal: number): number => kcal * KCAL_TO_KJ;
export const kjToKcal = (kj: number): number => kj / KCAL_TO_KJ;

export const cmToInches = (cm: number): number => cm / CM_PER_INCH;
export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;

/** Altura como la lee la gente ("5 ft 9 in"). Redondea a pulgada entera sin dejar "5 ft 12 in". */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export const feetInchesToCm = (feet: number, inches: number): number =>
  Math.round((feet * 12 + inches) * CM_PER_INCH);

/** Un decimal, para que el mismo peso se lea igual en todas las pantallas. */
export const kgToLbs = (kg: number): number => round(kg * LB_PER_KG, 1);
export const lbsToKg = (lbs: number): number => round(lbs / LB_PER_KG, 2);

export const gToOz = (g: number): number => g / G_PER_OZ;
export const ozToG = (oz: number): number => oz * G_PER_OZ;

export const mlToFlOz = (ml: number): number => ml / ML_PER_FL_OZ;
export const flOzToMl = (flOz: number): number => flOz * ML_PER_FL_OZ;
