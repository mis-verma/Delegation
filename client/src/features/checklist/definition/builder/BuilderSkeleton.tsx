import { Skeleton, PANEL_CLASS } from '../../../../components';
import { STEPS } from './builderModel';

export const BuilderSkeleton = () => (
  <div className="flex flex-col gap-6 w-full py-2 sm:py-4" aria-busy="true">
    <Skeleton className="h-4 w-72 max-w-full rounded" />
    <div className="flex items-center gap-3">
      <Skeleton className="size-11 rounded-lg shrink-0" />
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <Skeleton className="h-6 w-56 max-w-full rounded" />
        <Skeleton className="hidden sm:block h-4 w-80 max-w-full rounded" />
      </div>
    </div>
    <div className={`${PANEL_CLASS} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border/60 bg-muted/20">
        {Array.from({ length: STEPS.length }, (_, i) => (
          <Skeleton key={i} className="size-8 rounded-full shrink-0" />
        ))}
      </div>
      <div className="flex flex-col gap-4 p-4 sm:p-8 min-h-80">
        <Skeleton className="h-6 w-40 rounded" />
        <Skeleton className="h-12 w-full max-w-2xl rounded-lg" />
        <Skeleton className="h-24 w-full max-w-2xl rounded-lg" />
      </div>
    </div>
  </div>
);
