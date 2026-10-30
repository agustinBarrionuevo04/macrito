import { Skeleton } from '@/components/ui/skeleton';
import { es } from '@/lib/i18n/es';

/** Esqueleto del contenido del día mientras se cargan las entradas. */
export function DiarySkeleton() {
  return (
    <div role="status" aria-label={es.ui.loading} className="flex flex-col gap-6">
      <div className="flex items-center gap-5">
        <Skeleton className="size-[140px] rounded-full" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
