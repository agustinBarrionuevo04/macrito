import { z } from 'zod';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { DISPLAY_NAME_MAX, INPUT_RANGES } from './constants';
import {
  activityIssue,
  birthDateIssue,
  goalIssue,
  heightIssue,
  paceIssue,
  sexIssue,
  targetWeightIssue,
  weightIssue,
} from './validation';

const e = es.profile.errors;

const emptyToUndefined = (value: unknown) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value;

/**
 * Lo que se puede cargar del perfil. El esquema solo fija la forma; las reglas de negocio (rangos,
 * edad, ritmo, peso objetivo) están en `validation.ts` y se aplican acá en `superRefine`.
 * `today` (YYYY-MM-DD, en la zona horaria del usuario) viene de afuera para que la edad se
 * calcule sin depender del reloj del servidor.
 */
export function createProfileInputSchema(today: string) {
  return z
    .object({
      displayName: z.preprocess(
        emptyToUndefined,
        z
          .string()
          .trim()
          .max(DISPLAY_NAME_MAX, t(e.displayName, { max: DISPLAY_NAME_MAX }))
          .optional(),
      ),
      sex: z.enum(['male', 'female'], e.sex),
      birthDate: z.string(e.birthDate),
      heightCm: z.number(e.generic).finite(e.generic),
      /** Solo en el onboarding: después el peso se cambia registrándolo. */
      weightKg: z.number(e.generic).finite(e.generic).optional(),
      targetWeightKg: z.preprocess(
        emptyToUndefined,
        z.number(e.generic).finite(e.generic).optional(),
      ),
      activityLevel: z.enum(['sedentary', 'low_active', 'active', 'very_active'], e.activity),
      goal: z.enum(['lose', 'maintain', 'gain'], e.goal),
      weeklyGoalKg: z.preprocess(emptyToUndefined, z.number(e.pace).finite(e.pace).optional()),
      /** Sin preset no se tocan las columnas de macros del perfil. */
      macroPreset: z.enum(['high_protein', 'balanced', 'classic']).optional(),
    })
    .superRefine((value, ctx) => {
      const issues: [path: string, message: string | null][] = [
        ['sex', sexIssue(value.sex)],
        ['birthDate', birthDateIssue(value.birthDate, today)],
        ['heightCm', heightIssue(value.heightCm)],
        // El peso solo se valida si viene (en el onboarding es obligatorio: lo exige la acción).
        ['weightKg', value.weightKg === undefined ? null : weightIssue(value.weightKg)],
        ['activityLevel', activityIssue(value.activityLevel)],
        ['goal', goalIssue(value.goal)],
        ['weeklyGoalKg', paceIssue(value.goal, value.weeklyGoalKg)],
        ['targetWeightKg', targetWeightIssue(value.goal, value.weightKg, value.targetWeightKg)],
      ];
      for (const [path, message] of issues) {
        if (message) ctx.addIssue({ code: 'custom', path: [path], message });
      }
    });
}

export type ProfileInput = z.infer<ReturnType<typeof createProfileInputSchema>>;

/** Registrar peso: un número dentro del rango de `INPUT_RANGES.weightKg`. */
export const weightInputSchema = z
  .object({ weightKg: z.number(e.generic).finite(e.generic) })
  .superRefine((value, ctx) => {
    const message = weightIssue(value.weightKg);
    if (message) ctx.addIssue({ code: 'custom', path: ['weightKg'], message });
  });

export { INPUT_RANGES };
