import { memo, useId, useMemo } from 'react';
import { Link } from 'react-router';
import { Trophy, AlertTriangle, Building2, Store, ArrowRight } from 'lucide-react';
import { Button, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { MIN_RANK_VOLUME, NEEDS_ATTENTION_BELOW, rankRows, useOwnerRankings, type RankedRow } from './useOwnerRankings';
import { formatPercent } from './analyticsDisplay';

interface PerformanceLeadersCardProps {
  /** The window every ranking covers: the picked range, or the page's default window. */
  from?: string;
  to?: string;
  /** Jumps straight to the full ranked table (the Stores tab below) instead of this card
   *  duplicating it: this is the glance view, that is the drill-in. */
  onViewFull: () => void;
}

const TONE_CLASS = {
  success: 'bg-success/10 border-success/25 text-success',
  danger: 'bg-danger/10 border-danger/25 text-danger',
} as const;

interface LeaderEntryProps {
  icon: typeof Trophy;
  tone: keyof typeof TONE_CLASS;
  label: string;
  row: RankedRow | null;
  /** What to show when there is no row to name. */
  emptyText: string;
  to: string;
}

const LeaderEntry = memo(({ icon: Icon, tone, label, row, emptyText, to }: LeaderEntryProps) => {
  const content = (
    <>
      <span className={`flex items-center justify-center size-8 rounded-lg border shrink-0 ${TONE_CLASS[tone]}`}>
        <Icon size={14} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-display font-semibold tracking-wide text-text-muted">{label}</p>
        {row ? (
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-display font-bold text-text line-clamp-2 leading-snug">{row.name}</p>
            <span className="shrink-0 text-sm font-display font-medium text-text-muted tabular-nums">{formatPercent(row.overall)}</span>
          </div>
        ) : (
          <p className="text-sm font-display font-medium text-text-muted">{emptyText}</p>
        )}
      </div>
    </>
  );

  const base = 'flex items-center gap-2.5 min-w-0 min-h-11 rounded-lg';
  if (!row) return <div className={base}>{content}</div>;
  return (
    <Link
      to={to}
      className={`${base} px-1 transition-colors duration-200 motion-reduce:transition-none hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50`}
    >
      {content}
    </Link>
  );
});

interface DimensionColumnProps {
  icon: typeof Building2;
  title: string;
  rows: RankedRow[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  /** Where a row goes when it is clicked. */
  to: string;
  className?: string;
}

const DimensionColumn = ({ icon: Icon, title, rows, isPending, isError, isFetching, onRetry, to, className = '' }: DimensionColumnProps) => {
  const headingId = useId();
  const { top, low, hasEligible } = useMemo(() => {
    const { sorted, topId, lowId } = rankRows(rows);
    return {
      top: sorted.find((r) => r.id === topId) ?? null,
      low: sorted.find((r) => r.id === lowId) ?? null,
      hasEligible: rows.some((r) => r.overall != null && r.volume >= MIN_RANK_VOLUME),
    };
  }, [rows]);

  return (
    <div role="group" aria-labelledby={headingId} className={`flex flex-col gap-3 flex-1 min-w-0 ${className}`}>
      <div className="flex items-center gap-2 px-1">
        <Icon size={14} className="text-text-muted" aria-hidden="true" />
        <h3 id={headingId} className="text-sm font-display font-bold text-text">{title}</h3>
      </div>
      {isError ? (
        <InlineError message="Could not load this ranking." onRetry={onRetry} />
      ) : isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ) : (
        <div className={`flex flex-col gap-2.5 transition-opacity motion-reduce:transition-none ${isFetching ? 'opacity-60' : ''}`}>
          <LeaderEntry icon={Trophy} tone="success" label="Top" row={top} emptyText="Not enough data yet" to={to} />
          <LeaderEntry
            icon={AlertTriangle}
            tone="danger"
            label="Needs attention"
            row={low}
            emptyText={hasEligible ? `None below ${NEEDS_ATTENTION_BELOW}%` : 'Not enough data yet'}
            to={to}
          />
        </div>
      )}
    </div>
  );
};

// The owner-level "who's top, who's low" summary, scoped to the page's own date range and shown on
// the Overview itself. It reads the same ranked rows as the full Stores table (useOwnerRankings),
// so the two never disagree. Rows open the people and teams directory, the nearest page that
// lists a single department or store.
export const PerformanceLeadersCard = ({ from, to, onViewFull }: PerformanceLeadersCardProps) => {
  const headingId = useId();
  const {
    departmentRows, storeRows, departmentsPending, storesPending, departmentsError, storesError,
    departmentsFetching, storesFetching, retryDepartments, retryStores,
  } = useOwnerRankings(from, to);

  return (
    <section aria-labelledby={headingId} className={`${PANEL_CLASS} p-4 sm:p-5 flex flex-col gap-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-display font-bold text-text">How stores and departments are doing</h2>
          <p className="hidden sm:block text-xs font-display font-medium text-text-muted">
            Based on tickets and checklist work. Needs at least {MIN_RANK_VOLUME} items to be ranked.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onViewFull} className="shrink-0 max-sm:min-h-11">
          See full ranking
          <ArrowRight size={13} aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 sm:divide-x sm:divide-border">
        <DimensionColumn
          icon={Building2}
          title="Departments"
          rows={departmentRows}
          isPending={departmentsPending}
          isError={departmentsError}
          isFetching={departmentsFetching}
          onRetry={retryDepartments}
          to="/admin/directory?tab=departments"
        />
        <DimensionColumn
          icon={Store}
          title="Stores"
          rows={storeRows}
          isPending={storesPending}
          isError={storesError}
          isFetching={storesFetching}
          onRetry={retryStores}
          to="/admin/directory?tab=stores"
          className="sm:pl-6"
        />
      </div>
    </section>
  );
};
