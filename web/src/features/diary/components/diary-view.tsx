'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { es } from '@/lib/i18n/es';
import type { DailyTargets, MealType } from '@/types';
import { groupByMeal, sumSnapshots } from '../totals';
import { defaultMealFor } from '../meal';
import { MEAL_ORDER, type DiaryEntry } from '../types';
import { CopySheet, type CopySource } from './copy-sheet';
import { DaySummary } from './day-summary';
import { EntrySheet } from './entry-sheet';
import { MealSection } from './meal-section';
import { QuickAddSheet } from './quick-add-sheet';
import { SaveComboSheet } from '@/features/recipes/components/save-combo-sheet';

type Props = {
  day: string;
  today: string;
  entries: DiaryEntry[];
  targets: DailyTargets | null;
};

/** Contenido de la pantalla Hoy: resumen, comidas y las hojas de edición, copia y calorías rápidas. */
export function DiaryView({ day, today, entries, targets }: Props) {
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [copySource, setCopySource] = useState<CopySource | null>(null);
  // La comida sugerida depende de la hora del dispositivo: se calcula al abrir, no al renderizar
  // (en el servidor sería otra hora y la hidratación no coincidiría).
  const [comboMeal, setComboMeal] = useState<MealType | null>(null);
  const [quick, setQuick] = useState<{ meal: MealType; session: number } | null>(null);
  const quickSessions = useRef(0);

  const byMeal = groupByMeal(entries);
  const totals = sumSnapshots(entries);

  function copyMeal(meal: MealType) {
    setCopySource({ scope: 'meal', meal, count: byMeal[meal].length });
  }

  return (
    <>
      <DaySummary totals={totals} targets={targets} />

      {entries.length === 0 ? (
        <div className="bg-surface-muted flex flex-col items-center gap-2 rounded-2xl p-6 text-center">
          <p className="font-semibold">{es.diary.empty.title}</p>
          <p className="text-muted text-sm">{es.diary.empty.text}</p>
          <Link
            href={`/add?date=${day}`}
            className="bg-primary text-primary-foreground mt-2 inline-flex min-h-11 items-center rounded-lg px-4 font-medium"
          >
            {es.diary.empty.action}
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {MEAL_ORDER.map((meal) => (
          <MealSection
            key={meal}
            meal={meal}
            entries={byMeal[meal]}
            day={day}
            onOpen={setEditing}
            onCopy={copyMeal}
            onSaveCombo={setComboMeal}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            quickSessions.current += 1;
            setQuick({ meal: defaultMealFor(new Date()), session: quickSessions.current });
          }}
        >
          {es.diary.quickAdd.open}
        </Button>
        {entries.length > 0 ? (
          <Button
            variant="ghost"
            onClick={() => setCopySource({ scope: 'day', count: entries.length })}
          >
            {es.diary.copy.copyDay}
          </Button>
        ) : null}
      </div>

      <EntrySheet
        entry={editing}
        onClose={() => setEditing(null)}
        day={day}
        onCopy={(entry) =>
          setCopySource({ scope: 'entry', id: entry.id, name: entry.name, meal: entry.mealType })
        }
      />
      <CopySheet
        key={`${day}:${copySource?.scope ?? ''}:${copySource && 'id' in copySource ? copySource.id : ''}`}
        source={copySource}
        onClose={() => setCopySource(null)}
        day={day}
        today={today}
      />
      <SaveComboSheet meal={comboMeal} day={day} onClose={() => setComboMeal(null)} />
      <QuickAddSheet
        key={`${day}:${quick?.session ?? 0}`}
        open={quick !== null}
        onClose={() => setQuick(null)}
        day={day}
        defaultMeal={quick?.meal ?? 'breakfast'}
      />
    </>
  );
}
