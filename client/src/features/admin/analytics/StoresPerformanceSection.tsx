import { memo, useId, useMemo } from 'react';
import { Link } from 'react-router';
import { Trophy, AlertTriangle, Building2 } from 'lucide-react';
import { EmptyState, InlineError, PANEL_CLASS, ENTITY_CARD_CLASS, Skeleton } from '../../../components';
import { MIN_RANK_VOLUME, NEEDS_ATTENTION_BELOW, rankRows, useOwnerRankings, type RankedRow } from './useOwnerRankings';
import { useChecklistInstanceComplianceReportQuery } from './useAnalyticsQueries';
import { formatDuration, formatPercent } from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';

interface StoresPerformanceSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
}

// Colour follows the figure, but the figure is always written out too, so it never relies on colour alone.
const GOOD_FROM = 80;
const rateToneClass = (rate: number | null) => {
  if (rate == null) return 'text-text-muted';
  if (rate >= GOOD_FROM) return 'text-success';
  if (rate >= NEEDS_ATTENTION_BELOW) return 'text-warning';
  return 'text-danger';
};

const BADGE_BASE = 'inline-flex items-center gap-1 text-xs font-display font-bold px-1.5 py-0.5 rounded border whitespace-nowrap';

const RankBadge = ({ isTop, isLow }: { isTop: boolean; isLow: boolean }) => {
  if (isTop) {
    return (
      <span className={`${BADGE_BASE} bg-success/10 border-success/25 text-success`}>
        <Trophy size={12} aria-hidden="true" /> Top
      </span>
    );
  }
  if (isLow) {
    return (
      <span className={`${BADGE_BASE} bg-danger/10 border-danger/25 text-danger`}>
        <AlertTriangle size={12} aria-hidden="true" /> Needs attention
      </span>
    );
  }
  return null;
};

interface RankedRowProps {
  row: RankedRow;
  isTop: boolean;
  isLow: boolean;
  to: string;
}

const HEAD_CELL = 'font-display font-semibold text-xs text-text-muted px-4 py-3 whitespace-nowrap';
const NUMBER_CELL = 'px-4 py-3 text-right font-display tabular-nums';

const RankedTableRow = memo(({ row, isTop, isLow, to }: RankedRowProps) => (
  <tr className="border-t border-border/60 hover:bg-surface-hover/50 transition-colors motion-reduce:transition-none">
    <th scope="row" className="px-4 py-3 text-left font-display font-medium text-text">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to={to} className="rounded hover:text-primary-700 dark:hover:text-primary-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50">
          {row.name}
        </Link>
        <RankBadge isTop={isTop} isLow={isLow} />
      </div>
    </th>
    <td className={`${NUMBER_CELL} font-bold ${rateToneClass(row.overall)}`}>{formatPercent(row.overall)}</td>
    <td className={`${NUMBER_CELL} ${rateToneClass(row.ticketCompletion)}`}>{formatPercent(row.ticketCompletion)}</td>
    <td className={`${NUMBER_CELL} ${rateToneClass(row.secondaryRate)}`}>{formatPercent(row.secondaryRate)}</td>
    <td className={`${NUMBER_CELL} text-text`}>{row.openIssues}</td>
    <td className={`${NUMBER_CELL} text-text`}>{formatDuration(row.avgTat)}</td>
    <td className={`${NUMBER_CELL} ${rateToneClass(row.slaMet)}`}>{formatPercent(row.slaMet)}</td>
  </tr>
));

const Metric = ({ label, value, toneClass = 'text-text' }: { label: string; value: string | number; toneClass?: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-display text-xs text-text-muted">{label}</span>
    <span className={`font-display font-medium tabular-nums text-sm ${toneClass}`}>{value}</span>
  </div>
);

const RankedCard = memo(({ row, isTop, isLow, to, secondaryLabel }: RankedRowProps & { secondaryLabel: string }) => (
  <Link to={to} className={`${ENTITY_CARD_CLASS} gap-3 min-h-11`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col items-start gap-1 min-w-0">
        <p className="font-display font-medium text-text text-sm line-clamp-2 leading-snug">{row.name}</p>
        <RankBadge isTop={isTop} isLow={isLow} />
      </div>
      <span className={`shrink-0 text-sm font-display font-bold tabular-nums ${rateToneClass(row.overall)}`}>{formatPercent(row.overall)}</span>
    </div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <Metric label="Tickets closed" value={formatPercent(row.ticketCompletion)} toneClass={rateToneClass(row.ticketCompletion)} />
      <Metric label={secondaryLabel} value={formatPercent(row.secondaryRate)} toneClass={rateToneClass(row.secondaryRate)} />
      <Metric label="Open tickets" value={row.openIssues} />
      <Metric label="Avg time to close" value={formatDuration(row.avgTat)} />
      <Metric label="Closed on time" value={formatPercent(row.slaMet)} toneClass={rateToneClass(row.slaMet)} />
    </div>
  </Link>
));

interface RankedTableProps {
  title: string;
  subtitle: string;
  rows: RankedRow[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  emptyLabel: string;
  nameColumnLabel: string;
  secondaryLabel: string;
  /** Where each row opens: the directory tab that lists this kind of entity. */
  to: string;
}

const RankedTable = ({ title, subtitle, rows, isPending, isError, isFetching, onRetry, emptyLabel, nameColumnLabel, secondaryLabel, to }: RankedTableProps) => {
  const headingId = useId();
  // Best overall first, so who is top and who is low reads straight off the row order.
  const { sorted, topId, lowId } = useMemo(() => rankRows(rows), [rows]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="px-1">
        <h2 id={headingId} className="text-sm font-display font-bold text-text">{title}</h2>
        <p className="text-xs font-display font-medium text-text-muted">{subtitle}</p>
      </div>

      {isError ? (
        <InlineError message={`Could not load the ${title.toLowerCase()} ranking.`} onRetry={onRetry} />
      ) : isPending ? (
        <div className={`${PANEL_CLASS} flex flex-col gap-3 p-4 sm:p-5`}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className={`${PANEL_CLASS} p-4 sm:p-5`}>
          <EmptyState size="compact" icon={Building2} title={emptyLabel} description="Rows appear here once there is activity to rank." />
        </div>
      ) : (
        <div className={`transition-opacity motion-reduce:transition-none ${isFetching ? 'opacity-60' : ''}`}>
          <div className={`${PANEL_CLASS} hidden md:block overflow-x-auto`}>
            <table className="w-full text-sm">
              <caption className="sr-only">{title} ranked by overall score, best first</caption>
              <thead>
                <tr className="bg-surface-hover/60">
                  <th scope="col" className={`${HEAD_CELL} text-left`}>{nameColumnLabel}</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Overall</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Tickets closed</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>{secondaryLabel}</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Open tickets</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Avg time to close</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Closed on time</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <RankedTableRow key={row.id} row={row} isTop={row.id === topId} isLow={row.id === lowId} to={to} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: a stack of cards instead of a cramped scrolling table. */}
          <div className="md:hidden flex flex-col gap-3">
            {sorted.map((row) => (
              <RankedCard key={row.id} row={row} isTop={row.id === topId} isLow={row.id === lowId} to={to} secondaryLabel={secondaryLabel} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

// The owner-level view: real numbers, ranked, with who is top and who needs attention called out.
// Each row's "Overall" figure blends every kind of work that cut actually carries (tickets and
// delegations for a department, tickets and store checklists for a store), weighted by how many
// items sit behind each. Delegations have a department but no store, and checklist runs have a
// store but no department, so no single blend can cover all three for either cut.
export const StoresPerformanceSection = ({ groupBy, from, to }: StoresPerformanceSectionProps) => {
  const {
    departmentRows, storeRows, departmentsPending, storesPending, departmentsError, storesError,
    departmentsFetching, storesFetching, retryDepartments, retryStores,
  } = useOwnerRankings(from, to);

  // Page-level context for the store table. Same hook, and so the same request, as the store
  // checklist figures elsewhere on this page.
  const { data: auditRows, isPending: auditPending, isError: auditError } = useChecklistInstanceComplianceReportQuery(groupBy, from, to);
  const latestAudit = auditRows?.[auditRows.length - 1];
  const checklistCompletion = latestAudit?.completionRate ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-x-4 gap-y-1 flex-wrap px-1">
        <p className="text-xs font-display font-medium text-text-muted max-w-xl">
          Overall blends ticket completion with delegation completion for departments, or with checklist completion for stores. Best first. Needs at least {MIN_RANK_VOLUME} items to be ranked.
        </p>
        <p className="text-xs font-display font-semibold text-text-secondary shrink-0">
          Store checklist completion:{' '}
          <span className={auditError ? 'text-danger' : `tabular-nums ${rateToneClass(checklistCompletion)}`}>
            {auditError ? 'could not load' : auditPending ? 'Loading' : formatPercent(checklistCompletion)}
          </span>
        </p>
      </div>

      <RankedTable
        title="Departments"
        subtitle="Tickets and delegations"
        rows={departmentRows}
        isPending={departmentsPending}
        isError={departmentsError}
        isFetching={departmentsFetching}
        onRetry={retryDepartments}
        emptyLabel="No department data yet"
        nameColumnLabel="Department"
        secondaryLabel="Delegations done"
        to="/admin/directory?tab=departments"
      />

      <RankedTable
        title="Stores"
        subtitle="Tickets and store checklists"
        rows={storeRows}
        isPending={storesPending}
        isError={storesError}
        isFetching={storesFetching}
        onRetry={retryStores}
        emptyLabel="No store data yet"
        nameColumnLabel="Store"
        secondaryLabel="Checklists done"
        to="/admin/directory?tab=stores"
      />
    </div>
  );
};
