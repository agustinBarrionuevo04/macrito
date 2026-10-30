'use client';

import { useId } from 'react';
import { NumberInput } from '@/components/ui/number-input';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import { KCAL_PER_KG_PER_WEEK_DAILY } from '@/lib/nutrition';
import { ACTIVITY_LEVELS, MACRO_PRESET_IDS, SEXES, WEEKLY_PACE_OPTIONS } from '../constants';
import { withGoal, type ProfileDraft } from '../draft';
import { OptionCard } from './option-card';

const p = es.profile;

type FieldProps = {
  draft: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  error?: string | null;
};

function FieldError({ message }: { message?: string | null }) {
  return message ? (
    <p role="alert" className="text-danger text-sm">
      {message}
    </p>
  ) : null;
}

function Group({
  legend,
  help,
  children,
  error,
}: {
  legend: string;
  help?: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-xl font-semibold">{legend}</legend>
      {help ? <p className="text-muted -mt-2 text-sm">{help}</p> : null}
      {children}
      <FieldError message={error} />
    </fieldset>
  );
}

export function DisplayNameField({ draft, onChange }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {p.fields.displayName} <span className="text-muted font-normal">({p.optional})</span>
      </label>
      <input
        id={id}
        type="text"
        autoComplete="given-name"
        maxLength={60}
        value={draft.displayName}
        onChange={(event) => onChange({ displayName: event.target.value })}
        className="bg-surface border-border focus:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
      />
    </div>
  );
}

export function SexField({ draft, onChange, error }: FieldProps) {
  return (
    <Group legend={p.fields.sexTitle} help={p.fields.sexHelp} error={error}>
      {SEXES.map((sex) => (
        <OptionCard
          key={sex}
          name="sex"
          value={sex}
          checked={draft.sex === sex}
          onChange={() => onChange({ sex })}
          title={sex === 'male' ? p.fields.male : p.fields.female}
        />
      ))}
    </Group>
  );
}

export function BirthField({ draft, onChange, error, today }: FieldProps & { today: string }) {
  const id = useId();
  return (
    <Group legend={p.fields.birthTitle} error={error}>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          {p.fields.birthDate}
        </label>
        <input
          id={id}
          type="date"
          max={today}
          autoComplete="bday"
          value={draft.birthDate}
          onChange={(event) => onChange({ birthDate: event.target.value })}
          className="bg-surface border-border focus:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
        />
      </div>
    </Group>
  );
}

/** Altura y, solo en el onboarding, el peso: después el peso se cambia registrándolo. */
export function BodyFields({
  draft,
  onChange,
  error,
  showWeight,
}: FieldProps & { showWeight: boolean }) {
  return (
    <Group legend={p.fields.bodyTitle} error={error}>
      <NumberInput
        label={p.fields.height}
        unit="cm"
        decimals={0}
        value={draft.heightCm}
        onChange={(heightCm) => onChange({ heightCm })}
      />
      {showWeight ? (
        <NumberInput
          label={p.fields.weight}
          unit="kg"
          decimals={1}
          value={draft.weightKg}
          onChange={(weightKg) => onChange({ weightKg })}
        />
      ) : null}
    </Group>
  );
}

export function ActivityField({ draft, onChange, error }: FieldProps) {
  return (
    <Group legend={p.fields.activityTitle} error={error}>
      {ACTIVITY_LEVELS.map((level) => (
        <OptionCard
          key={level}
          name="activity"
          value={level}
          checked={draft.activityLevel === level}
          onChange={() => onChange({ activityLevel: level })}
          title={p.activity[level].title}
          description={p.activity[level].description}
        />
      ))}
    </Group>
  );
}

const PACE_TAG: Record<string, string> = {
  '0.25': p.pace.gentle,
  '0.5': p.pace.moderate,
  '0.75': p.pace.intense,
  '1': p.pace.veryIntense,
};

export function GoalFields({ draft, onChange, error }: FieldProps) {
  const paceOptions =
    draft.goal === 'lose' || draft.goal === 'gain' ? WEEKLY_PACE_OPTIONS[draft.goal] : [];

  return (
    <div className="flex flex-col gap-6">
      <Group legend={p.fields.goalTitle} error={paceOptions.length === 0 ? error : null}>
        {(['lose', 'maintain', 'gain'] as const).map((goal) => (
          <OptionCard
            key={goal}
            name="goal"
            value={goal}
            checked={draft.goal === goal}
            onChange={() => {
              const next = withGoal(draft, goal);
              onChange({ goal: next.goal, weeklyGoalKg: next.weeklyGoalKg });
            }}
            title={p.goals[goal]}
          />
        ))}
      </Group>

      {paceOptions.length > 0 ? (
        <Group legend={p.fields.paceTitle} help={p.fields.paceHelp} error={error}>
          {paceOptions.map((kg) => {
            const abs = Math.abs(kg);
            return (
              <OptionCard
                key={kg}
                name="pace"
                value={String(kg)}
                checked={draft.weeklyGoalKg === kg}
                onChange={() => onChange({ weeklyGoalKg: kg })}
                title={
                  <>
                    {t(p.pace.label, { kg: formatNumber(abs, 2) })}{' '}
                    <span className="text-muted font-normal">({PACE_TAG[String(abs)]})</span>
                  </>
                }
                description={t(p.pace.kcal, {
                  kcal: formatNumber(abs * KCAL_PER_KG_PER_WEEK_DAILY, 0),
                })}
              />
            );
          })}
        </Group>
      ) : null}

      {draft.goal ? (
        <NumberInput
          label={`${p.fields.targetWeight} (${p.optional})`}
          unit="kg"
          decimals={1}
          value={draft.targetWeightKg}
          onChange={(targetWeightKg) => onChange({ targetWeightKg })}
        />
      ) : null}
    </div>
  );
}

export function MacroPresetField({ draft, onChange }: FieldProps) {
  return (
    <Group legend={p.fields.macrosTitle} help={p.fields.macrosHelp}>
      {MACRO_PRESET_IDS.map((id) => (
        <OptionCard
          key={id}
          name="macro-preset"
          value={id}
          checked={draft.macroPreset === id}
          onChange={() => onChange({ macroPreset: id })}
          title={p.presets[id].title}
          description={p.presets[id].description}
        />
      ))}
    </Group>
  );
}
