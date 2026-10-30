import type { ActivityLevel, Goal, MacroSplit, Sex } from '@/types';
import { MACRO_PRESETS } from '@/lib/nutrition';

/** Zona horaria por defecto de los perfiles nuevos (coincide con el default de la columna). */
export const DEFAULT_TIMEZONE = 'America/Argentina/Cordoba';

export const SEXES: Sex[] = ['male', 'female'];
export const ACTIVITY_LEVELS: ActivityLevel[] = [
  'sedentary',
  'low_active',
  'active',
  'very_active',
];
export const GOALS: Goal[] = ['lose', 'maintain', 'gain'];

/** Límites de lo que se acepta en formularios (más estrictos que los de la librería de cálculo). */
export const INPUT_RANGES = {
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 25, max: 400 },
} as const;

export const DISPLAY_NAME_MAX = 60;

/** Ritmos semanales ofrecidos, en kg por semana (negativo = bajar). */
export const WEEKLY_PACE_OPTIONS = {
  lose: [-0.25, -0.5, -0.75, -1],
  gain: [0.25, 0.5],
} as const;

export const DEFAULT_WEEKLY_PACE = { lose: -0.5, gain: 0.25 } as const;

export type MacroPresetId = 'high_protein' | 'balanced' | 'classic';

/**
 * `null` = sin reparto fijo: proteína por kg según el objetivo, 25 % de grasa y el resto en
 * carbohidratos (el comportamiento por defecto de `calcTargets`).
 */
export const MACRO_PRESET_SPLITS: Record<MacroPresetId, MacroSplit | null> = {
  high_protein: null,
  balanced: MACRO_PRESETS.balanced,
  classic: MACRO_PRESETS.classic,
};

export const MACRO_PRESET_IDS: MacroPresetId[] = ['high_protein', 'balanced', 'classic'];
export const DEFAULT_MACRO_PRESET: MacroPresetId = 'high_protein';
