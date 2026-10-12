import { memo, useId, useMemo } from 'react';
import { Link } from 'react-router';
import { Trophy, AlertTriangle, Building2 } from 'lucide-react';
import { ActiveRangeBadge, EmptyState, ExportMenu, InlineError, PANEL_CLASS, ENTITY_CARD_CLASS, Skeleton } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { toDayParam } from '../../../api/checklistInstances';
import { scorecardRowHref } from '../../dashboard/scoreDrill';
import { MIN_RANK_VOLUME, NEEDS_ATTENTION_BELOW, rankRows, useOwnerRankings, type RankedRow } from './useOwnerRankings';
import { useChecklistInstanceComplianceReportQuery } from './useAnalyticsQueries';
import { formatDuration, formatPercent, statCaption } from './analyticsDisplay';

interface StoresPerformanceSectionProps {
  /** The window the whole page is showing: the picked range, or the page's default window. */
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

// A figure over a handful of items is shown but not ranked, and says so.
const FewItemsTag = ({ row }: { row: RankedRow }) =>
  row.overall != null && row.volume < MIN_RANK_VOLUME ? (
    <span className="text-xs font-display font-medium text-text-muted whitespace-nowrap">Too few items to rank</span>
  ) : null;

interface RankedRowProps {
  row: RankedRow;
  isTop: boolean;
  isLow: boolean;
  hrefFor: (id: string) => string;
}

const HEAD_CELL = 'font-display font-semibold text-xs text-text-muted px-4 py-3 whitespace-nowrap';
const NUMBER_CELL = 'px-4 py-3 text-right font-display tabular-nums';

const RankedTableRow = memo(({ row, isTop, isLow, hrefFor }: RankedRowProps) => (
  <tr className="border-t border-border/60 hover:bg-surface-hover/50 transition-colors motion-reduce:transition-none">
    <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-3 text-left font-display font-medium text-text">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to={hrefFor(row.id)} className="rounded hover:text-primary-700 dark:hover:text-primary-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50">
          {row.name}
        </Link>
        <RankBadge isTop={isTop} isLow={isLow} />
        <FewItemsTag row={row} />
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

const RankedCard = memo(({ row, isTop, isLow, hrefFor, secondaryLabel }: RankedRowProps & { secondaryLabel: string }) => (
  <Link to={hrefFor(row.id)} className={`${ENTITY_CARD_CLASS} gap-3 min-h-11`}>
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
  onRetry: () => void;
  emptyLabel: string;
  nameColumnLabel: string;
  secondaryLabel: string;
  /** Where each row opens: that department or store on the Scorecard. */
  hrefFor: (id: string) => string;
  /** The page's window, for the export's title. */
  windowFrom?: string;
  windowTo?: string;
}

const RankedTable = ({ title, subtitle, rows, isPending, isError, onRetry, emptyLabel, nameColumnLabel, secondaryLabel, hrefFor, windowFrom, windowTo }: RankedTableProps) => {
  const headingId = useId();
  // Best overall first, so who is top and who is low reads straight off the row order.
  const { sorted, topId, lowId } = useMemo(() => rankRows(rows), [rows]);

  // The table as on screen, best first. Rows with too few items keep their place but get no rank.
  const exportRows = (): TableRows => {
    let rank = 0;
    return [
      ['Rank', nameColumnLabel, 'Badge', 'Overall score', 'Tickets closed %', `${secondaryLabel} %`, 'Open tickets', 'Avg time to close (hours)', 'Closed on time %'],
      ...sorted.map((r) => {
        const ranked = r.overall != null && r.volume >= MIN_RANK_VOLUME;
        if (ranked) rank += 1;
        const badge = r.id === topId ? 'Top' : r.id === lowId ? 'Needs attention' : r.overall != null && !ranked ? 'Too few items to rank' : '';
        return [ranked ? rank : null, r.name, badge, exportPct(r.overall), exportPct(r.ticketCompletion), exportPct(r.secondaryRate), r.openIssues, r.avgTat == null ? null : Math.round(r.avgTat * 10) / 10, exportPct(r.slaMet)];
      }),
    ];
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 id={headingId} className="t-card font-display font-bold text-text">{title}</h2>
          <p className="text-xs font-display font-medium text-text-muted">{subtitle}</p>
        </div>
        <ExportMenu
          disabled={isPending || isError || sorted.length === 0}
          aria-label={`Export the ${title.toLowerCase()} ranking`}
          filename={`rankings-${title.toLowerCase()}`}
          sheetName={title}
          title={exportTitle({ what: `Rankings, ${title}`, from: windowFrom, to: windowTo })}
          getRows={exportRows}
        />
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
        <div>
          <div className={`${PANEL_CLASS} hidden md:block overflow-x-auto`}>
            <table className="w-full text-sm">
              <caption className="sr-only">{title} ranked by overall score, best first</caption>
              <thead>
                <tr className="bg-surface-hover/60">
                  <th scope="col" className={`${HEAD_CELL} text-left sticky left-0 z-10 bg-surface-hover`}>{nameColumnLabel}</th>
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
                  <RankedTableRow key={row.id} row={row} isTop={row.id === topId} isLow={row.id === lowId} hrefFor={hrefFor} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: a stack of cards instead of a cramped scrolling table. */}
          <div className="md:hidden flex flex-col gap-3">
            {sorted.map((row) => (
              <RankedCard key={row.id} row={row} isTop={row.id === topId} isLow={row.id === lowId} hrefFor={hrefFor} secondaryLabel={secondaryLabel} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

// The owner-level view: real numbers, ranked, with who is top and who needs attention called out.
// Each row's "Overall" is the shared Overall score (completion and compliance counted equally), the
// same figure the Scorecard shows. Rows open that department or store on the Scorecard.
export const StoresPerformanceSection = ({ from, to }: StoresPerformanceSectionProps) => {
  const {
    departmentRows, storeRows, departmentsPending, storesPending, departmentsError, storesError,
    retryDepartments, retryStores,
  } = useOwnerRankings(from, to);

  const dayFrom = from ? toDayParam(from) : undefined;
  const dayTo = to ? toDayParam(to) : undefined;

  // Page-level context for the store table: one figure over the same window as every row below it
  // ('none' = a single bucket for the whole from/to), not the newest bucket of a grouped series.
  const { data: auditRows, isPending: auditPending, isError: auditError } = useChecklistInstanceComplianceReportQuery('none', from, to);
  const checklistCompletion = auditRows?.[auditRows.length - 1]?.completionRate ?? null;
  const checklistCaption = statCaption({ isPending: auditPending, isError: auditError, hasData: checklistCompletion != null, noDataText: 'No data' });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-x-4 gap-y-1 flex-wrap px-1">
        <ActiveRangeBadge from={from} to={to} />
        <p className="text-xs font-display font-medium text-text-muted max-w-xl basis-full sm:basis-auto sm:flex-1">
          Overall score: completion and compliance counted equally across checklists, tickets and delegations. Best first. Needs at least {MIN_RANK_VOLUME} items to be ranked.
        </p>
        <p className="text-xs font-display font-semibold text-text-secondary shrink-0">
          Store checklist completion:{' '}
          <span className={auditError ? 'text-danger' : `tabular-nums ${rateToneClass(checklistCompletion)}`}>
            {checklistCaption || formatPercent(checklistCompletion)}
          </span>
        </p>
      </div>

      <RankedTable
        title="Departments"
        subtitle="Tickets, delegations and checklists"
        rows={departmentRows}
        isPending={departmentsPending}
        isError={departmentsError}
        onRetry={retryDepartments}
        emptyLabel="No department data yet"
        nameColumnLabel="Department"
        secondaryLabel="Delegations done"
        hrefFor={(id) => scorecardRowHref('department', id, dayFrom ?? '', dayTo ?? '')}
        windowFrom={from}
        windowTo={to}
      />

      <RankedTable
        title="Stores"
        subtitle="Tickets and store checklists"
        rows={storeRows}
        isPending={storesPending}
        isError={storesError}
        onRetry={retryStores}
        emptyLabel="No store data yet"
        nameColumnLabel="Store"
        secondaryLabel="Checklists done"
        hrefFor={(id) => scorecardRowHref('store', id, dayFrom ?? '', dayTo ?? '')}
        windowFrom={from}
        windowTo={to}
      />
    </div>
  );
};
