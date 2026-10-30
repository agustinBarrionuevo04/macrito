'use client';

import { useRouter } from 'next/navigation';
import { useRef, useTransition, type ReactNode, type TouchEvent } from 'react';
import { es } from '@/lib/i18n/es';
import { cx } from '@/lib/ui/cx';
import { swipeDirection } from '@/lib/ui/swipe';
import { addDays, dayLabel, isValidDay } from '../dates';

const d = es.diary.day;

type Props = { day: string; today: string; children: ReactNode };

const chevron = (path: string) => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
);

const arrow =
  'text-foreground hover:bg-surface-muted inline-flex size-11 items-center justify-center rounded-lg disabled:opacity-40';

/**
 * Selector de día (anterior, siguiente y fecha) y deslizamiento horizontal sobre el contenido.
 * No deja ir a días futuros. La URL es la fuente de verdad: `/` es hoy y `/?date=AAAA-MM-DD` otro día.
 */
export function DayPager({ day, today, children }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const touch = useRef<{ x: number; y: number } | null>(null);

  const label = dayLabel(day, today);
  const labelText = label.kind === 'date' ? label.text : d[label.kind];
  const canGoNext = day < today;

  function go(target: string) {
    if (target === day || target > today || !isValidDay(target)) return;
    startTransition(() => router.push(target === today ? '/' : `/?date=${target}`));
  }

  function onTouchStart(event: TouchEvent) {
    const point = event.touches[0];
    touch.current = point ? { x: point.clientX, y: point.clientY } : null;
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touch.current;
    const point = event.changedTouches[0];
    touch.current = null;
    if (!start || !point) return;
    const direction = swipeDirection(point.clientX - start.x, point.clientY - start.y);
    if (direction === 'right') go(addDays(day, -1));
    if (direction === 'left' && canGoNext) go(addDays(day, 1));
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={d.previous}
          onClick={() => go(addDays(day, -1))}
          className={arrow}
        >
          {chevron('M15 6l-6 6 6 6')}
        </button>

        <div className="relative flex min-h-11 flex-1 items-center justify-center">
          <h1 className="text-lg font-semibold first-letter:uppercase" aria-live="polite">
            {labelText}
          </h1>
          <input
            type="date"
            aria-label={d.pick}
            value={day}
            min="2000-01-01"
            max={today}
            onChange={(event) => go(event.target.value)}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>

        <button
          type="button"
          aria-label={d.next}
          disabled={!canGoNext}
          onClick={() => go(addDays(day, 1))}
          className={arrow}
        >
          {chevron('M9 6l6 6-6 6')}
        </button>
      </div>

      {day !== today ? (
        <button
          type="button"
          onClick={() => go(today)}
          className="text-primary -mt-2 min-h-9 self-center text-sm font-medium"
        >
          {d.goToToday}
        </button>
      ) : null}

      <div
        aria-busy={pending || undefined}
        className={cx('flex flex-col gap-6', pending && 'opacity-60')}
      >
        {children}
      </div>
    </div>
  );
}
