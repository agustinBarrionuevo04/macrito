'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { es } from '@/lib/i18n/es';
import { cx } from '@/lib/ui/cx';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** `sheet` se ancla abajo, como una hoja en el celular. */
  variant?: 'center' | 'sheet';
  className?: string;
};

/**
 * Modal sobre el elemento <dialog> nativo: el navegador resuelve el foco, el cierre con Esc y el
 * resto de la página inerte. Se cierra con Esc, tocando afuera o con el botón de cerrar.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  variant = 'center',
  className,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // Un clic directo sobre el <dialog> (y no sobre su contenido) es un clic en el fondo.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cx(
        'bg-surface text-foreground border-border m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border p-0 shadow-xl',
        'backdrop:bg-black/50',
        variant === 'sheet' &&
          'mb-0 max-w-none rounded-b-none sm:mb-auto sm:max-w-md sm:rounded-2xl',
        variant === 'sheet' && 'w-full',
        className,
      )}
    >
      <div className={cx('flex flex-col gap-4 p-5', variant === 'sheet' && 'pb-safe')}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-muted text-sm">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={es.ui.close}
            className="text-muted hover:bg-surface-muted -mt-1 -mr-2 inline-flex size-11 items-center justify-center rounded-lg"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
