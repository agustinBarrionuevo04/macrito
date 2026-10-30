import type { ActivityLevel, Goal, Sex, UserProfile } from '@/types';
import { NutritionInputError, calcTargets, type TargetsBreakdown } from '@/lib/nutrition';
import {
  DEFAULT_MACRO_PRESET,
  DEFAULT_WEEKLY_PACE,
  MACRO_PRESET_SPLITS,
  type MacroPresetId,
} from './constants';
import type { ProfileInput } from './schema';
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

/** Lo que el usuario va completando en el wizard (y en el editor del perfil). */
export type ProfileDraft = {
  displayName: string;
  sex: Sex | null;
  birthDate: string;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  weeklyGoalKg: number | null;
  targetWeightKg: number | null;
  /** `keep`: el perfil tiene un reparto propio (3-K) y no se toca salvo que elija un preset. */
  macroPreset: MacroPresetId | 'keep';
};

export function emptyDraft(): ProfileDraft {
  return {
    displayName: '',
    sex: null,
    birthDate: '',
    heightCm: null,
    weightKg: null,
    activityLevel: null,
    goal: null,
    weeklyGoalKg: null,
    targetWeightKg: null,
    macroPreset: DEFAULT_MACRO_PRESET,
  };
}

export const ONBOARDING_STEPS = [
  'welcome',
  'sex',
  'birth',
  'body',
  'activity',
  'goal',
  'macros',
  'summary',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Primer error del paso, o `null` si se puede avanzar. `today` es `YYYY-MM-DD`. */
export function validateStep(
  step: OnboardingStep,
  draft: ProfileDraft,
  today: string,
): string | null {
  switch (step) {
    case 'sex':
      return sexIssue(draft.sex);
    case 'birth':
      return birthDateIssue(draft.birthDate, today);
    case 'body':
      return heightIssue(draft.heightCm) ?? weightIssue(draft.weightKg);
    case 'activity':
      return activityIssue(draft.activityLevel);
    case 'goal':
      return (
        goalIssue(draft.goal) ??
        paceIssue(draft.goal, draft.weeklyGoalKg) ??
        targetWeightIssue(draft.goal, draft.weightKg, draft.targetWeightKg)
      );
    default:
      return null;
  }
}

/** Primer paso inválido y su mensaje, o `null` si todo el borrador es válido. */
export function firstInvalidStep(
  draft: ProfileDraft,
  today: string,
  steps: readonly OnboardingStep[] = ONBOARDING_STEPS,
): { step: OnboardingStep; message: string } | null {
  for (const step of steps) {
    const message = validateStep(step, draft, today);
    if (message) return { step, message };
  }
  return null;
}

/** Al cambiar de objetivo se ajusta el ritmo: el de antes puede no existir para el nuevo. */
export function withGoal(draft: ProfileDraft, goal: Goal): ProfileDraft {
  const weeklyGoalKg = goal === 'maintain' ? null : DEFAULT_WEEKLY_PACE[goal];
  return { ...draft, goal, weeklyGoalKg };
}

/** Lo que se manda al servidor. Solo se llama con un borrador ya validado. */
export function draftToInput(
  draft: ProfileDraft,
  options: { includeWeight: boolean },
): ProfileInput {
  const input = {
    displayName: draft.displayName.trim() === '' ? undefined : draft.displayName.trim(),
    sex: draft.sex,
    birthDate: draft.birthDate,
    heightCm: draft.heightCm,
    targetWeightKg: draft.targetWeightKg ?? undefined,
    activityLevel: draft.activityLevel,
    goal: draft.goal,
    weeklyGoalKg: draft.weeklyGoalKg ?? undefined,
    macroPreset: draft.macroPreset === 'keep' ? undefined : draft.macroPreset,
    ...(options.includeWeight ? { weightKg: draft.weightKg ?? undefined } : {}),
  };
  return input as ProfileInput;
}

/** Perfil a partir del borrador, para calcular la meta en vivo. `null` si todavía falta algo. */
export function draftToProfile(draft: ProfileDraft, timezone: string): UserProfile | null {
  const { sex, birthDate, heightCm, weightKg, activityLevel, goal } = draft;
  if (!sex || !birthDate || heightCm === null || weightKg === null || !activityLevel || !goal)
    return null;

  const profile: UserProfile = {
    sex,
    birthDate,
    heightCm,
    weightKg,
    activityLevel,
    goal,
    kcalAdjustment: 0,
    timezone,
  };
  if (draft.weeklyGoalKg !== null) profile.weeklyGoalKg = draft.weeklyGoalKg;
  if (draft.targetWeightKg !== null) profile.targetWeightKg = draft.targetWeightKg;
  const split = draft.macroPreset === 'keep' ? null : MACRO_PRESET_SPLITS[draft.macroPreset];
  if (split) profile.macroSplit = split;
  return profile;
}

/** Meta calculada con el borrador, o `null` si no alcanza para calcularla. */
export function previewTargets(
  draft: ProfileDraft,
  timezone: string,
  today: string,
): TargetsBreakdown | null {
  const profile = draftToProfile(draft, timezone);
  if (!profile) return null;
  try {
    return calcTargets(profile, { today });
  } catch (error) {
    if (error instanceof NutritionInputError) return null;
    throw error;
  }
}
