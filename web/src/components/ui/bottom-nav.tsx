'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { es } from '@/lib/i18n/es';
import { cx } from '@/lib/ui/cx';
import { isNavActive } from '@/lib/ui/nav';

type Item = { href: string; label: string; icon: ReactNode };

const svg = (path: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
);

const ITEMS: Item[] = [
  { href: '/', label: es.ui.nav.today, icon: svg(<path d="M3 11l9-8 9 8M5 10v10h14V10" />) },
  { href: '/add', label: es.ui.nav.add, icon: svg(<path d="M12 5v14M5 12h14" />) },
  {
    href: '/progress',
    label: es.ui.nav.progress,
    icon: svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  },
  {
    href: '/profile',
    label: es.ui.nav.profile,
    icon: svg(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </>,
    ),
  },
];

/** Navegación inferior de la app: Hoy · Agregar · Progreso · Perfil. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      data-bottom-nav
      aria-label={es.ui.nav.label}
      className="bg-surface/95 border-border pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {ITEMS.map(({ href, label, icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  active ? 'text-primary' : 'text-muted',
                )}
              >
                {icon}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
