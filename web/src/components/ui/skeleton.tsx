import { cx } from '@/lib/ui/cx';

/** Marcador de contenido que carga. Es decorativo: el texto "Cargando" lo da el contenedor. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx('bg-surface-muted animate-pulse rounded-md', className)}
    />
  );
}
