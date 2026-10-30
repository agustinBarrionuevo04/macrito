'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { updateProfile } from '../actions';
import { draftToInput, firstInvalidStep, type ProfileDraft } from '../draft';
import {
  ActivityField,
  BirthField,
  BodyFields,
  DisplayNameField,
  GoalFields,
  MacroPresetField,
  SexField,
} from './fields';

type Props = { initial: ProfileDraft; today: string };

/** Pasos que valida el editor: el peso no se edita acá, se registra aparte. */
const EDITABLE_STEPS = ['sex', 'birth', 'activity', 'goal'] as const;

/** Editor de los datos del perfil. Al guardar, la meta se recalcula sola con los datos nuevos. */
export function ProfileEditor({ initial, today }: Props) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const update = (patch: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const errorFor = (field: string) => (error?.field === field ? error.message : null);

  function save() {
    const invalid = firstInvalidStep(draft, today, EDITABLE_STEPS);
    if (invalid) {
      setError({ field: invalid.step, message: invalid.message });
      return;
    }
    startTransition(async () => {
      const result = await updateProfile(draftToInput(draft, { includeWeight: false }));
      if (result.ok) {
        setError(null);
        toast.show({ message: es.profile.saved, tone: 'success' });
      } else {
        setError({ field: 'form', message: result.error });
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <DisplayNameField draft={draft} onChange={update} />
      <SexField draft={draft} onChange={update} error={errorFor('sex')} />
      <BirthField draft={draft} onChange={update} error={errorFor('birth')} today={today} />
      <BodyFields draft={draft} onChange={update} showWeight={false} />
      <ActivityField draft={draft} onChange={update} error={errorFor('activity')} />
      <GoalFields draft={draft} onChange={update} error={errorFor('goal')} />
      <MacroPresetField draft={draft} onChange={update} />

      {error?.field === 'form' ? (
        <p role="alert" className="text-danger text-sm">
          {error.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending}>
        {pending ? es.profile.saving : es.profile.save}
      </Button>
    </form>
  );
}
