import Link from 'next/link';
import { es } from '@/lib/i18n/es';
import { cx } from '@/lib/ui/cx';
import { DEFAULT_RANGE, RANGES, type Range } from '../constants';

const labels: Record<Range, string> = {
  7: es.progress.ranges.d7,
  30: es.progress.ranges.d30,
  90: es.progress.ranges.d90,
};

/** Selector de período. Son links (`?range=`): la URL manda y no hace falta JavaScript. */
export function RangeTabs({ current }: { current: Range }) {
  return (
    <nav
      aria-label={es.progress.ranges.label}
      className="bg-surface-muted grid grid-cols-3 gap-1 rounded-xl p-1"
    >
      {RANGES.map((range) => (
        <Link
          key={range}
          href={range === DEFAULT_RANGE ? '/progress' : `/progress?range=${range}`}
          aria-current={range === current ? 'page' : undefined}
          className={cx(
            'flex min-h-11 items-center justify-center rounded-lg text-sm font-medium',
            range === current ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
          )}
        >
          {labels[range]}
        </Link>
      ))}
    </nav>
  );
}
