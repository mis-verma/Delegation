import { Skeleton } from './Skeleton';

export const RouteFallback = () => (
  <div className="flex flex-col gap-5 w-full" role="status" aria-label="Loading page">
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 rounded-xl shrink-0" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton className="h-3 w-56 rounded" />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/60 bg-surface p-4 flex flex-col gap-3">
          <Skeleton className="h-4 w-2/3 rounded" />
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  </div>
);
