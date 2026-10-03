import { CheckCircle2, CheckCheck, Keyboard, SearchX, History } from 'lucide-react';
import { Button, EmptyState, InlineError, Skeleton } from '../../components';
import { ChecklistQueueRow } from './ChecklistQueueRow';
import type { ChecklistRow } from './verificationModel';

// Same card shape as a real row, so nothing shifts when the data arrives.
const SkeletonRow = () => (
  <li className="flex flex-col gap-2.5 p-3 sm:p-3.5 rounded-lg border border-border/60 bg-surface" aria-hidden>
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-3 w-12" />
    </div>
    <div className="flex gap-1.5">
      <Skeleton className="h-6 w-28 rounded-full" />
      <Skeleton className="h-6 w-24 rounded-full" />
    </div>
  </li>
);

interface ChecklistListProps {
  rows: ChecklistRow[];
  now: number;
  activeId: string | null;
  isPending: boolean;
  /** The first load failed; with data on screen a failed refresh is not shown. */
  loadFailed: boolean;
  onRetry: () => void;
  filtersActive: boolean;
  onClearFilters: () => void;
  /** Opens today's decisions from the empty state. Omit to leave the action out. */
  onShowDecided?: () => void;
  /** "Approve all clean": how many, progress while it runs, and the handler. Omit to hide the button. */
  cleanCount?: number;
  bulk?: { done: number; total: number } | null;
  onApproveAllClean?: () => void;
  /** Load more. */
  hasMore: boolean;
  remaining: number;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  /** Opens the keyboard shortcut list (keyboard screens only). Omit to hide it. */
  onShowShortcuts?: () => void;
  showDepartment?: boolean;
  inlineActions?: 'below-lg' | 'always';
  heading?: string;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onSendBack: (id: string) => void;
}

/** The checklist rows with their loading, error, empty and load-more states. */
export const ChecklistList = ({
  rows, now, activeId, isPending, loadFailed, onRetry, filtersActive, onClearFilters, onShowDecided,
  cleanCount = 0, bulk = null, onApproveAllClean, hasMore, remaining, isFetchingMore, onLoadMore, onShowShortcuts,
  showDepartment = true, inlineActions = 'below-lg', heading = 'Checklists', onOpen, onApprove, onSendBack,
}: ChecklistListProps) => (
  <section className="flex flex-col gap-3 min-w-0" aria-label={heading}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-display font-semibold text-text">{heading}</h2>
        {!isPending && rows.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-border/50 text-[11px] font-display font-medium text-text-muted tabular-nums">{rows.length}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onShowShortcuts && (
          <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={onShowShortcuts}>
            <Keyboard size={14} aria-hidden />
            ? Shortcuts
          </Button>
        )}
        {onApproveAllClean && cleanCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="border-success/40 text-success hover:bg-success/10 hover:border-success/60 hover:text-success"
            disabled={!!bulk}
            isLoading={!!bulk}
            onClick={onApproveAllClean}
          >
            {!bulk && <CheckCheck size={14} aria-hidden />}
            {bulk ? `Approving ${Math.min(bulk.done + 1, bulk.total)} of ${bulk.total}` : `Approve all clean (${cleanCount})`}
          </Button>
        )}
      </div>
    </div>

    {loadFailed && <InlineError message="We couldn't load the checklists waiting for review. Check your connection and try again." onRetry={onRetry} />}

    {isPending && <ul className="flex flex-col gap-2.5"><SkeletonRow /><SkeletonRow /><SkeletonRow /></ul>}

    {!isPending && !loadFailed && rows.length === 0 && (
      filtersActive ? (
        <EmptyState
          icon={SearchX}
          title="No checklists match these filters"
          description="Try another store, person or age, or clear the search."
          action={{ label: 'Clear filters', onClick: onClearFilters }}
        />
      ) : (
        <EmptyState
          icon={CheckCircle2}
          tone="success"
          title="All caught up"
          description="No checklists are waiting for your review."
          action={onShowDecided ? { label: "See today's decisions", onClick: onShowDecided, icon: History } : undefined}
        />
      )
    )}

    {rows.length > 0 && (
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <ChecklistQueueRow
            key={row.id}
            row={row}
            now={now}
            active={row.id === activeId}
            showDepartment={showDepartment}
            inlineActions={inlineActions}
            onOpen={onOpen}
            onApprove={onApprove}
            onSendBack={onSendBack}
          />
        ))}
      </ul>
    )}

    {!isPending && hasMore && (
      <div className="flex flex-col items-center gap-1.5">
        <Button variant="outline" size="sm" isLoading={isFetchingMore} onClick={onLoadMore}>
          Load more ({remaining} remaining)
        </Button>
        <p className="text-xs font-display text-text-muted text-center">Sorting and filters work on the checklists loaded so far.</p>
      </div>
    )}
  </section>
);
