import { Skeleton } from '@/components/ui/skeleton';
import { es } from '@/lib/i18n/es';

export default function Loading() {
  return (
    <div role="status" aria-label={es.ui.loading} className="flex flex-col gap-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-11 w-full" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
