import { Skeleton } from '../../../components';
import { TICKET_GRID_CLASS } from './ticketLayout';

type SkeletonView = 'list' | 'board' | 'table' | 'timeline';

// Same card anatomy as TicketCard (two-line title + avatar, meta line, chip row), in the same grid,
// so the list does not jump when tickets arrive. Extra cards are hidden where the grid has fewer
// columns, so a phone is not handed a wall of placeholders.
const CardSkeleton = ({ className }: { className?: string }) => (
  <div className={`flex flex-col gap-2.5 p-3.5 rounded-2xl bg-surface border border-border/60 ${className ?? ''}`}>
    <div className="flex items-start gap-2">
      <div className="flex-1 flex flex-col gap-1 sm:gap-2">
        <Skeleton className="h-4 w-4/5 rounded-md" />
        <Skeleton className="h-4 w-1/2 rounded-md" />
      </div>
      <Skeleton className="size-5 sm:size-6 rounded-full shrink-0" />
    </div>
    <Skeleton className="h-4 w-24 rounded-md" />
    {/* Three chips on phones (status, priority, due), a fourth from sm where department joins. */}
    <div className="flex items-center gap-1.5 flex-wrap">
      <Skeleton className="h-6 sm:h-7 w-20 rounded-full" />
      <Skeleton className="h-6 sm:h-7 w-16 rounded-full" />
      <Skeleton className="h-6 sm:h-7 w-20 rounded-full" />
      <Skeleton className="hidden sm:block h-7 w-24 rounded-full" />
    </div>
  </div>
);

const ListSkeleton = () => (
  <div className="flex flex-col gap-3 sm:gap-4">
    <div className="flex items-center gap-2 px-0.5">
      <Skeleton className="size-6 sm:size-7 rounded-md shrink-0" />
      <Skeleton className="h-4 w-32 rounded-md" />
    </div>
    <div className={TICKET_GRID_CLASS}>
      {Array.from({ length: 8 }).map((_, i) => (
        <CardSkeleton
          key={i}
          className={i >= 6 ? 'hidden lg:flex' : i >= 3 ? 'hidden sm:flex' : undefined}
        />
      ))}
    </div>
  </div>
);

const BoardSkeleton = () => (
  <div className="grid grid-flow-col auto-cols-[17.5rem] sm:auto-cols-[minmax(18rem,1fr)] lg:auto-cols-[minmax(15rem,1fr)] gap-3 sm:gap-4 overflow-hidden">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex flex-col gap-3 p-2.5 rounded-2xl border border-border/40 bg-surface-hover/30">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-6 w-7 rounded-full" />
        </div>
        <CardSkeleton />
        <CardSkeleton className={i % 2 === 0 ? undefined : 'hidden sm:flex'} />
      </div>
    ))}
  </div>
);

const TableSkeleton = () => (
  <div className="w-full overflow-hidden rounded-lg border border-border/60 bg-surface">
    <div className="h-10 bg-primary-800" />
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 px-3 py-3 border-t border-border/40">
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

const TimelineSkeleton = () => (
  <div className="w-full overflow-hidden rounded-lg border border-border/60 bg-surface">
    <div className="h-10 bg-primary-800" />
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-center border-t border-border/40">
        <div className="w-44 sm:w-52 lg:w-64 xl:w-72 shrink-0 flex flex-col gap-1.5 px-3 py-3">
          <Skeleton className="h-3.5 w-4/5 rounded-md" />
          <Skeleton className="h-3 w-1/3 rounded-md" />
        </div>
        <div className="flex-1 min-w-0 px-3">
          <Skeleton className="h-5 rounded-md" style={{ width: `${30 + ((i * 17) % 50)}%` }} />
        </div>
      </div>
    ))}
  </div>
);

export const TicketListSkeleton = ({ view = 'list' }: { view?: SkeletonView }) => {
  if (view === 'board') return <BoardSkeleton />;
  if (view === 'table') return <TableSkeleton />;
  if (view === 'timeline') return <TimelineSkeleton />;
  return <ListSkeleton />;
};
