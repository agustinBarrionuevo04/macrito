import Link from 'next/link';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { MealType } from '@/types';
import { sumSnapshots } from '../totals';
import type { DiaryEntry } from '../types';
import { EntryRow } from './entry-row';

const m = es.diary.meal;

type Props = {
  meal: MealType;
  entries: DiaryEntry[];
  day: string;
  onOpen: (entry: DiaryEntry) => void;
  onCopy: (meal: MealType) => void;
};

/** Una comida del día: título con sus calorías, entradas y botones para agregar o copiar. */
export function MealSection({ meal, entries, day, onOpen, onCopy }: Props) {
  const name = es.diary.meals[meal];
  const kcal = sumSnapshots(entries).kcal;

  return (
    <section aria-labelledby={`meal-${meal}`} className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`meal-${meal}`} className="text-base font-semibold">
          {name}
        </h2>
        <span className="text-muted text-sm tabular-nums">
          {t(m.kcal, { kcal: formatNumber(kcal, 0) })}
        </span>
      </div>

      {entries.length > 0 ? (
        <ul className="flex flex-col">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="text-muted px-2 py-1 text-sm">{m.empty}</p>
      )}

      <div className="flex gap-2">
        <Link
          href={`/add?meal=${meal}&date=${day}`}
          className="text-primary inline-flex min-h-11 items-center px-2 text-sm font-medium"
        >
          {t(m.add, { meal: name.toLowerCase() })}
        </Link>
        {entries.length > 0 ? (
          <button
            type="button"
            onClick={() => onCopy(meal)}
            className="text-muted inline-flex min-h-11 items-center px-2 text-sm"
          >
            {t(m.copy, { meal: name.toLowerCase() })}
          </button>
        ) : null}
      </div>
    </section>
  );
}
