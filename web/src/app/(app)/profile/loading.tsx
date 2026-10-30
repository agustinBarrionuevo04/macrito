import { Skeleton } from '@/components/ui/skeleton';
import { es } from '@/lib/i18n/es';

export default function Loading() {
  return (
    <div role="status" aria-label={es.ui.loading} className="flex flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
