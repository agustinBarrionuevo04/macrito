'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { MealType } from '@/types';
import { deleteEntry, restoreEntry, updateEntry } from '../actions';
import { MAX_QUANTITY_G } from '../constants';
import { scaleSnapshot } from '../snapshot';
import type { DiaryEntry } from '../types';
import { MealSelect } from './meal-select';

const ed = es.diary.edit;

type Props = {
  /** `null` = cerrada. */
  entry: DiaryEntry | null;
  onClose: () => void;
  day: string;
  onCopy: (entry: DiaryEntry) => void;
};

/** Edición de una entrada: cantidad, comida, borrar (con deshacer) y copiar a otro día. */
export function EntrySheet({ entry, onClose, day, onCopy }: Props) {
  // El formulario se reinicia cuando cambia la entrada: `key` en el componente interno.
  return (
    <Sheet open={entry !== null} onClose={onClose} title={ed.title} description={entry?.name}>
      {entry ? (
        <EntryForm key={entry.id} entry={entry} onClose={onClose} day={day} onCopy={onCopy} />
      ) : null}
    </Sheet>
  );
}

function EntryForm({
  entry,
  onClose,
  day,
  onCopy,
}: {
  entry: DiaryEntry;
  onClose: () => void;
  day: string;
  onCopy: (entry: DiaryEntry) => void;
}) {
  const isQuick = entry.quantityG === 0;
  const [quantity, setQuantity] = useState<number | null>(isQuick ? null : entry.quantityG);
  const [meal, setMeal] = useState<MealType>(entry.mealType);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const quantityValid = quantity !== null && quantity > 0 && quantity <= MAX_QUANTITY_G;
  const preview =
    !isQuick && quantityValid ? scaleSnapshot(entry, entry.quantityG, quantity) : null;

  function save() {
    const patch: { quantity_g?: number; meal_type?: MealType } = {};
    if (!isQuick) {
      if (!quantityValid) {
        setError(t(es.diary.errors.quantity, { max: formatNumber(MAX_QUANTITY_G, 0) }));
        return;
      }
      if (quantity !== entry.quantityG) patch.quantity_g = quantity;
    }
    if (meal !== entry.mealType) patch.meal_type = meal;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    startTransition(async () => {
      const result = await updateEntry(entry.id, patch);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show({ message: ed.saved, tone: 'success' });
      onClose();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteEntry(entry.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      toast.show({
        message: ed.deleted,
        action: {
          label: ed.undo,
          onClick: () => {
            void restoreEntry({ ...entry, day }).then((restored) => {
              toast.show(
                restored.ok
                  ? { message: ed.restored, tone: 'success' }
                  : { message: restored.error, tone: 'error' },
              );
            });
          },
        },
      });
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {isQuick ? (
        <p className="text-muted text-sm">{ed.quickNote}</p>
      ) : (
        <NumberInput
          label={ed.quantity}
          unit="g"
          decimals={1}
          value={quantity}
          onChange={(value) => {
            setQuantity(value);
            setError(null);
          }}
        />
      )}

      <p className="text-sm tabular-nums" aria-live="polite">
        <span className="font-semibold">{formatNumber((preview ?? entry).kcal, 0)} kcal</span>
        <span className="text-muted">
          {' · '}P {formatNumber((preview ?? entry).protein_g, 1)} · C{' '}
          {formatNumber((preview ?? entry).carbs_g, 1)} · G{' '}
          {formatNumber((preview ?? entry).fat_g, 1)}
        </span>
      </p>

      <MealSelect label={ed.meal} value={meal} onChange={setMeal} />

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending}>
        {ed.save}
      </Button>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={pending}
          onClick={() => {
            onClose();
            onCopy(entry);
          }}
        >
          {ed.copy}
        </Button>
        <Button variant="danger" className="flex-1" disabled={pending} onClick={remove}>
          {ed.delete}
        </Button>
      </div>
    </form>
  );
}
