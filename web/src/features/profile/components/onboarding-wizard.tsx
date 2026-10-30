'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { completeOnboarding } from '../actions';
import {
  ONBOARDING_STEPS,
  draftToInput,
  emptyDraft,
  firstInvalidStep,
  previewTargets,
  validateStep,
  type OnboardingStep,
  type ProfileDraft,
} from '../draft';
import {
  ActivityField,
  BirthField,
  BodyFields,
  GoalFields,
  MacroPresetField,
  SexField,
} from './fields';
import { GoalSummary } from './goal-summary';

const o = es.profile.onboarding;

type Props = {
  /** Hoy (`YYYY-MM-DD`) en la zona horaria del usuario; lo calcula el servidor para no desfasar la hidratación. */
  today: string;
  timezone: string;
};

/** Pasos con pregunta: sin la bienvenida, para numerar "Paso 1 de 7". */
const NUMBERED_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS.filter(
  (step) => step !== 'welcome',
);

export function OnboardingWizard({ today, timezone }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const step: OnboardingStep = ONBOARDING_STEPS[stepIndex] ?? 'welcome';
  const update = (patch: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  function goNext() {
    const problem = validateStep(step, draft, today);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStepIndex((index) => Math.min(index + 1, ONBOARDING_STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setSubmitError(null);
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  function confirm() {
    // Último control antes de guardar: si algo quedó inválido, se vuelve a ese paso.
    const invalid = firstInvalidStep(draft, today);
    if (invalid) {
      setStepIndex(ONBOARDING_STEPS.indexOf(invalid.step));
      setError(invalid.message);
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      // Si sale bien, la acción redirige a "/" y esta promesa no vuelve.
      const result = await completeOnboarding(draftToInput(draft, { includeWeight: true }));
      if (!result.ok) setSubmitError(result.error);
    });
  }

  const numbered = NUMBERED_STEPS.indexOf(step) + 1;
  const breakdown = step === 'summary' ? previewTargets(draft, timezone, today) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-6">
      {step !== 'welcome' ? (
        <header className="mb-6 flex flex-col gap-2">
          <p className="text-muted text-sm">
            {t(o.step, { current: numbered, total: NUMBERED_STEPS.length })}
          </p>
          <div
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={NUMBERED_STEPS.length}
            aria-valuenow={numbered}
            aria-label={t(o.step, { current: numbered, total: NUMBERED_STEPS.length })}
            className="bg-surface-muted h-1.5 overflow-hidden rounded-full"
          >
            <div
              className="bg-primary h-full rounded-full transition-[width]"
              style={{ width: `${(numbered / NUMBERED_STEPS.length) * 100}%` }}
            />
          </div>
        </header>
      ) : null}

      <form
        className="flex flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === 'summary') confirm();
          else goNext();
        }}
      >
        <div className="flex flex-1 flex-col gap-6 pb-6">
          {step === 'welcome' && (
            <div className="flex flex-1 flex-col justify-center gap-4">
              <h1 className="text-3xl font-bold">{o.welcomeTitle}</h1>
              <p className="text-muted">{o.welcomeText}</p>
              <p className="border-warning bg-surface-muted rounded-lg border-l-4 p-3 text-sm">
                {es.profile.disclaimer}
              </p>
            </div>
          )}
          {step === 'sex' && <SexField draft={draft} onChange={update} error={error} />}
          {step === 'birth' && (
            <BirthField draft={draft} onChange={update} error={error} today={today} />
          )}
          {step === 'body' && (
            <BodyFields draft={draft} onChange={update} error={error} showWeight />
          )}
          {step === 'activity' && <ActivityField draft={draft} onChange={update} error={error} />}
          {step === 'goal' && <GoalFields draft={draft} onChange={update} error={error} />}
          {step === 'macros' && <MacroPresetField draft={draft} onChange={update} />}
          {step === 'summary' && (
            <div className="flex flex-col gap-4">
              <h1 className="text-2xl font-bold">{o.summaryTitle}</h1>
              {breakdown ? (
                <GoalSummary breakdown={breakdown} />
              ) : (
                <p role="alert" className="text-danger">
                  {error ?? es.profile.errors.generic}
                </p>
              )}
              <p className="text-muted text-sm">{es.profile.disclaimer}</p>
              {submitError ? (
                <p role="alert" className="text-danger text-sm">
                  {submitError}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="bg-background pb-safe sticky bottom-0 flex gap-3 py-4">
          {step !== 'welcome' ? (
            <Button variant="secondary" onClick={goBack} disabled={pending} className="flex-1">
              {es.profile.back}
            </Button>
          ) : null}
          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={step === 'summary' && !breakdown}
            className="flex-[2]"
          >
            {step === 'welcome'
              ? o.start
              : step === 'summary'
                ? pending
                  ? o.confirming
                  : o.confirm
                : es.profile.next}
          </Button>
        </div>
      </form>
    </main>
  );
}
