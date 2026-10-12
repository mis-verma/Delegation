import { memo, useId, useMemo } from 'react';
import { Link } from 'react-router';
import { Trophy, AlertTriangle, Building2, Store, ArrowRight } from 'lucide-react';
import { ActiveRangeBadge, Button, ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { toDayParam } from '../../../api/checklistInstances';
import { scorecardRowHref } from '../../dashboard/scoreDrill';
import { MIN_RANK_VOLUME, NEEDS_ATTENTION_BELOW, rankRows, useOwnerRankings, type RankedRow } from './useOwnerRankings';
import { formatPercent } from './analyticsDisplay';

interface PerformanceLeadersCardProps {
  /** The window every ranking covers: the picked range, or the page's default window. */
  from?: string;
  to?: string;
  /** Opens the full ranking page instead of this card duplicating it: this is the glance view,
   *  that is the drill-in. */
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
  /** Where the named row opens: its row on the Scorecard. */
  hrefFor: (id: string) => string;
}

const FIGURE_TONE = { success: 'text-success', danger: 'text-danger' } as const;
const BAR_TONE = { success: 'bg-success', danger: 'bg-danger' } as const;

const LeaderEntry = memo(({ icon: Icon, tone, label, row, emptyText, hrefFor }: LeaderEntryProps) => {
  const value = row?.overall ?? null;
  const content = (
    <>
      <span className="flex items-center gap-2">
        <span className={`flex items-center justify-center size-7 rounded-lg border shrink-0 ${TONE_CLASS[tone]}`}>
          <Icon size={14} aria-hidden="true" />
        </span>
        <span className="flex-1 t-meta font-display font-semibold text-text-muted">{label}</span>
        {row && <span className={`t-card font-display font-bold tabular-nums ${FIGURE_TONE[tone]}`}>{formatPercent(value)}</span>}
      </span>
      {row ? (
        <>
          <span className="block text-sm font-display font-semibold text-text line-clamp-2 leading-snug">{row.name}</span>
          <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
            <span className={`block h-full rounded-full ${BAR_TONE[tone]}`} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
          </span>
        </>
      ) : (
        <span className="block t-meta text-text-muted">{emptyText}</span>
      )}
    </>
  );

  const base = 'flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-surface p-3';
  if (!row) return <div className={base}>{content}</div>;
  return (
    <Link
      viewTransition
      to={hrefFor(row.id)}
      className={`${base} transition-[border-color,transform] duration-150 motion-reduce:transition-none hover:border-border-hover active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50`}
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
  onRetry: () => void;
  /** Where a row goes when it is clicked: that department or store on the Scorecard. */
  hrefFor: (id: string) => string;
  className?: string;
}

const DimensionColumn = ({ icon: Icon, title, rows, isPending, isError, onRetry, hrefFor, className = '' }: DimensionColumnProps) => {
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
        <h3 id={headingId} className="t-card font-display font-bold text-text">{title}</h3>
      </div>
      {isError ? (
        <InlineError message="Could not load this ranking." onRetry={onRetry} />
      ) : isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-2 @md:grid-cols-2`}>
          {/* Two "Not enough data yet" rows said the same thing twice; say it once. */}
          {!top && !low && !hasEligible ? (
            <p className="@md:col-span-2 rounded-lg border border-border/60 px-3 py-3 t-meta text-text-muted">Not enough data yet</p>
          ) : (
            <>
              <LeaderEntry icon={Trophy} tone="success" label="Top" row={top} emptyText="Needs at least two to compare" hrefFor={hrefFor} />
              <LeaderEntry
                icon={AlertTriangle}
                tone="danger"
                label="Needs attention"
                row={low}
                emptyText={hasEligible ? `None below ${NEEDS_ATTENTION_BELOW}%` : 'Not enough data yet'}
                hrefFor={hrefFor}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

// The owner-level "who's top, who's low" summary, scoped to the page's own date range and shown on
// the Overview itself. It reads the same ranked rows as the full Rankings page (useOwnerRankings),
// so the two never disagree. Rows open that department or store on the Scorecard, for the same window.
export const PerformanceLeadersCard = ({ from, to, onViewFull }: PerformanceLeadersCardProps) => {
  const headingId = useId();
  const dayFrom = from ? toDayParam(from) : undefined;
  const dayTo = to ? toDayParam(to) : undefined;
  const {
    departmentRows, storeRows, departmentsPending, storesPending, departmentsError, storesError,
    retryDepartments, retryStores,
  } = useOwnerRankings(from, to);

  // The names on the card (top and needs attention, per group) with the figures behind each.
  const exportRows = (): TableRows => {
    const out: TableRows[number][] = [['Group', 'Position', 'Name', 'Overall score', 'Tickets closed %', 'Delegations done %', 'Checklists done %', 'Items']];
    for (const [group, rows] of [['Departments', departmentRows], ['Stores', storeRows]] as const) {
      const { sorted, topId, lowId } = rankRows(rows);
      for (const [position, id] of [['Top', topId], ['Needs attention', lowId]] as const) {
        const r = sorted.find((x) => x.id === id);
        if (!r) continue;
        const departments = group === 'Departments';
        out.push([group, position, r.name, exportPct(r.overall), exportPct(r.ticketCompletion), departments ? exportPct(r.secondaryRate) : null, exportPct(departments ? r.checklistRate : r.secondaryRate), r.volume]);
      }
    }
    return out;
  };

  return (
    <section aria-labelledby={headingId} className={`${PANEL_CLASS} @container p-4 sm:p-5 flex flex-col gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h2 id={headingId} className="t-card font-display font-bold text-text">How stores and departments are doing</h2>
          <p className="hidden sm:block text-xs font-display font-medium text-text-muted">
            Tickets, delegations and checklists. Needs at least {MIN_RANK_VOLUME} items to be ranked.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onViewFull} className="shrink-0 max-sm:min-h-11">
            See full ranking
            <ArrowRight size={13} aria-hidden="true" />
          </Button>
          <ExportMenu
            disabled={departmentsPending || storesPending}
            aria-label="Export the top and lowest stores and departments"
            filename="overview-leaders"
            sheetName="Leaders"
            title={exportTitle({ what: 'Overview, how stores and departments are doing', from, to })}
            getRows={exportRows}
          />
        </div>
      </div>

      <ActiveRangeBadge from={from} to={to} />

      <div className="flex flex-col @2xl:flex-row gap-4 @2xl:gap-6 @2xl:divide-x @2xl:divide-border">
        <DimensionColumn
          icon={Building2}
          title="Departments"
          rows={departmentRows}
          isPending={departmentsPending}
          isError={departmentsError}
          onRetry={retryDepartments}
          hrefFor={(id) => scorecardRowHref('department', id, dayFrom ?? '', dayTo ?? '')}
        />
        <DimensionColumn
          icon={Store}
          title="Stores"
          rows={storeRows}
          isPending={storesPending}
          isError={storesError}
          onRetry={retryStores}
          hrefFor={(id) => scorecardRowHref('store', id, dayFrom ?? '', dayTo ?? '')}
          className="@2xl:pl-6"
        />
      </div>
    </section>
  );
};
