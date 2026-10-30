'use client';

import { useState } from 'react';
import { es } from '@/lib/i18n/es';
import { cx } from '@/lib/ui/cx';
import { THEME_STORAGE_KEY, applyTheme, type ThemePreference } from '@/lib/ui/theme';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: es.ui.theme.light },
  { value: 'dark', label: es.ui.theme.dark },
  { value: 'system', label: es.ui.theme.system },
];

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Selector de tema. El valor se guarda en este navegador y lo aplica el script inline del layout. */
export function ThemeToggle({ className }: { className?: string }) {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    typeof window === 'undefined' ? 'system' : readPreference(),
  );

  function choose(value: ThemePreference) {
    setPreference(value);
    try {
      if (value === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // Sin almacenamiento (modo privado): el cambio vale solo para esta sesión.
    }
    applyTheme(value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={es.ui.theme.label}
      className={cx('bg-surface-muted inline-flex rounded-lg p-1', className)}
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => choose(value)}
          className={cx(
            'min-h-9 rounded-md px-3 text-sm font-medium',
            preference === value ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
