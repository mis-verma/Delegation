import { Fragment } from 'react';
import { CheckCircle2, CheckCheck, Flag, Keyboard, SearchX, History, ShieldAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, InlineError, Skeleton } from '../../components';
import { ChecklistQueueRow } from './ChecklistQueueRow';
import { groupOf, type ChecklistRow, type QueueGroup } from './verificationModel';

const SkeletonRow = () => (
  <li className="flex flex-col gap-3 p-3 sm:p-4 rounded-xl border border-border/60 bg-surface" aria-hidden>
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
  loadFailed: boolean;
  onRetry: () => void;
  filtersActive: boolean;
  onClearFilters: () => void;
  onShowDecided?: () => void;
  cleanCount?: number;
  bulk?: { done: number; total: number } | null;
  onApproveAllClean?: () => void;
  hasMore: boolean;
  remaining: number;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onShowShortcuts?: () => void;
  showDepartment?: boolean;
  inlineActions?: 'below-lg' | 'always';
  heading?: string;
  grouped?: boolean;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onSendBack: (id: string) => void;
  onSendBackItem?: (id: string, itemId: string) => void;
}

const GROUP_META: Record<QueueGroup, { label: string; icon: LucideIcon; tone: string }> = {
  critical: { label: 'Critical answers failed', icon: ShieldAlert, tone: 'text-danger' },
  attention: { label: 'Needs a look', icon: Flag, tone: 'text-warning' },
  ready: { label: 'Ready to approve', icon: CheckCheck, tone: 'text-success' },
};

export const ChecklistList = ({
  rows, now, activeId, isPending, loadFailed, onRetry, filtersActive, onClearFilters, onShowDecided,
  cleanCount = 0, bulk = null, onApproveAllClean, hasMore, remaining, isFetchingMore, onLoadMore, onShowShortcuts,
  showDepartment = true, inlineActions = 'below-lg', heading = 'Checklists', grouped = false, onOpen, onApprove, onSendBack, onSendBackItem,
}: ChecklistListProps) => {
  const groupCounts = { critical: 0, attention: 0, ready: 0 };
  for (const r of rows) groupCounts[groupOf(r)] += 1;
  return (
  <section className="flex flex-col gap-3 min-w-0" aria-label={heading}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="t-section font-display font-bold text-text">{heading}</h2>
        {!isPending && rows.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-border/50 t-meta font-display font-medium text-text-muted tabular-nums">{rows.length}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onShowShortcuts && (
          <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={onShowShortcuts}>
            <Keyboard size={14} aria-hidden />
            Shortcuts
          </Button>
        )}
        {!grouped && onApproveAllClean && cleanCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="border-success/40 text-success hover:bg-success/10 hover:border-success/60 hover:text-success"
            disabled={!!bulk}
            isLoading={!!bulk}
            onClick={onApproveAllClean}
          >
            {!bulk && <CheckCheck size={14} aria-hidden />}
            {bulk ? `Approving ${Math.min(bulk.done + 1, bulk.total)} of ${bulk.total}` : `Approve ${cleanCount} with no issues`}
          </Button>
        )}
      </div>
    </div>

    {loadFailed && <InlineError message="We couldn't load the checklists waiting for review. Check your connection and try again." onRetry={onRetry} />}

    {isPending && <ul className="flex flex-col gap-3"><SkeletonRow /><SkeletonRow /><SkeletonRow /></ul>}

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
      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const group = groupOf(row);
          const starts = grouped && (index === 0 || groupOf(rows[index - 1]) !== group);
          const meta = GROUP_META[group];
          return (
            <Fragment key={row.id}>
              {starts && (
                <li role="presentation" className={cn('flex items-center justify-between gap-2', index > 0 && 'pt-2')}>
                  <h3 className={cn('inline-flex items-center gap-1.5 t-meta font-display font-bold', meta.tone)}>
                    <meta.icon size={14} aria-hidden />
                    {meta.label}
                    <span className="tabular-nums font-semibold text-text-muted">{groupCounts[group]}</span>
                  </h3>
                  {group === 'ready' && onApproveAllClean && cleanCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-success/40 text-success hover:bg-success/10 hover:border-success/60 hover:text-success"
                      disabled={!!bulk}
                      isLoading={!!bulk}
                      onClick={onApproveAllClean}
                    >
                      {!bulk && <CheckCheck size={14} aria-hidden />}
                      {bulk ? `Approving ${Math.min(bulk.done + 1, bulk.total)} of ${bulk.total}` : `Approve all ${cleanCount}`}
                    </Button>
                  )}
                </li>
              )}
              <ChecklistQueueRow
                row={row}
                now={now}
                active={row.id === activeId}
                showDepartment={showDepartment}
                inlineActions={inlineActions}
                onOpen={onOpen}
                onApprove={onApprove}
                onSendBack={onSendBack}
                onSendBackItem={onSendBackItem}
              />
            </Fragment>
          );
        })}
      </ul>
    )}

    {!isPending && hasMore && (
      <div className="flex flex-col items-center gap-1.5">
        <Button variant="outline" size="sm" isLoading={isFetchingMore} onClick={onLoadMore}>
          Load more ({remaining} remaining)
        </Button>
        <p className="t-meta font-display text-text-muted text-center">Sorting and filters work on the checklists loaded so far.</p>
      </div>
    )}
  </section>
  );
};
