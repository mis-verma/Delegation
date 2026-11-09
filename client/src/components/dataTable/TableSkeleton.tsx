import { Skeleton } from '../skeleton';

export const TableSkeleton = ({ rows = 8, label = 'Loading' }: { rows?: number; label?: string }) => (
  <div role="status" aria-label={label} className="w-full overflow-hidden rounded-lg border border-border/60 bg-surface">
    <div className="h-10 bg-primary-800" aria-hidden="true" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 px-3 py-3 border-t border-border/40" aria-hidden="true">
        <Skeleton className="h-4 flex-1 min-w-0 rounded-md" />
        <Skeleton className="h-5 w-20 rounded-full shrink-0" />
        <Skeleton className="hidden sm:block h-5 w-16 rounded-full shrink-0" />
        <Skeleton className="hidden md:block h-4 w-20 rounded-md shrink-0" />
        <Skeleton className="hidden lg:block h-4 w-24 rounded-md shrink-0" />
        <Skeleton className="hidden xl:block h-4 w-24 rounded-md shrink-0" />
      </div>
    ))}
  </div>
);
