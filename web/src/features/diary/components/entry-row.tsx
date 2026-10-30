import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { DiaryEntry } from '../types';

const m = es.diary.entry;

/** Una entrada del diario. Es un botón: al tocarla se abre la edición. */
export function EntryRow({
  entry,
  onOpen,
}: {
  entry: DiaryEntry;
  onOpen: (entry: DiaryEntry) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(entry)}
        aria-label={t(m.edit, { name: entry.name })}
        className="hover:bg-surface-muted flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{entry.name}</span>
          <span className="text-muted text-sm">
            {entry.quantityG > 0
              ? t(m.grams, { grams: formatNumber(entry.quantityG, 1) })
              : m.quick}
          </span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1 tabular-nums">
          {entry.isEstimate ? (
            <span title={m.estimate} aria-label={m.estimate} role="img" className="text-muted">
              {m.estimateMark}
            </span>
          ) : null}
          <span className="font-semibold">{formatNumber(entry.kcal, 0)}</span>
          <span className="text-muted text-xs">kcal</span>
        </span>
      </button>
    </li>
  );
}
