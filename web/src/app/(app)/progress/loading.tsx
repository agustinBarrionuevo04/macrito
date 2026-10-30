import { Skeleton } from '@/components/ui/skeleton';
import { es } from '@/lib/i18n/es';

export default function Loading() {
  return (
    <div role="status" aria-label={es.ui.loading} className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-52 w-full" />
    </div>
  );
}
