import { memo, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, ListChecks, ShieldCheck, type LucideIcon } from 'lucide-react';
import { StatCard, type Trend } from '../../dashboard';
import { DrilldownModal, type DrilldownRow } from '../../dashboard/DrilldownModal';
import { InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { ticketApi } from '../../../api/ticket';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import {
  useTaskComplianceReportQuery,
  useTicketTatReportQuery,
  useChecklistInstanceComplianceReportQuery,
  useTicketOwnerStatsQuery,
} from './useAnalyticsQueries';
import {
  bucketRange,
  describeLatestPeriod,
  formatPercent,
  latestWithTrend,
  NO_TREND,
  periodHeading,
  slaMetWithTrend,
  statCaption,
} from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';
import type { Ticket } from '../../../api/ticket';

export type SummarySection = 'delegations' | 'store-checklists';

interface AnalyticsSummaryStripProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  /** Jumps to the tab further down this same page that explains the number, which every role that
   *  can see this page can reach (a route link would not be, for MANAGER/SENIOR). */
  onViewSection: (section: SummarySection) => void;
  /** ADMIN/PC only: the drill-down modal's "View all tickets" button points at /admin/tickets,
   *  which MANAGER/SENIOR cannot open. */
  isOrgWideRole: boolean;
}

// ---------------------------------------------------------------------------------------------
// Tile: a compact two-up tile on a phone, the full StatCard from sm up
// ---------------------------------------------------------------------------------------------

export interface StatTileProps {
  label: string;
  value: number | string;
  caption?: string;
  trend?: Trend;
  lowerIsBetter?: boolean;
  icon?: LucideIcon;
  iconTint?: string;
  iconBgTint?: string;
  isLoading?: boolean;
  onClick?: () => void;
}

// Written placeholders for a tile that has no figure: never a bare dash standing in for a value.
const NO_DATA_VALUE = 'No data';
const LOADING_VALUE = 'Loading';

const MOBILE_TILE_BASE = `${PANEL_CLASS} flex flex-col gap-1 p-3.5 text-left min-w-0`;
const MOBILE_TILE_INTERACTIVE =
  'cursor-pointer transition-colors duration-150 motion-reduce:transition-none hover:border-primary-300 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50';

const MobileStatTile = ({ label, value, caption, trend, lowerIsBetter = false, isLoading, onClick }: StatTileProps) => {
  const hasTrend = trend != null && trend.label !== '—';
  // A change of zero is neither good nor bad, same as StatCard.
  const isFlat = hasTrend && Number.parseFloat(trend.label) === 0;
  const isGood = trend ? (trend.direction === 'up') !== lowerIsBetter : true;
  const trendClass = isFlat ? 'text-text-muted' : isGood ? 'text-success' : 'text-danger';
  const isPlaceholder = value === NO_DATA_VALUE || value === LOADING_VALUE;
  const body = (
    <>
      <span className="text-xs font-display font-semibold text-text-muted leading-snug break-words">{label}</span>
      {isLoading ? (
        <Skeleton className="h-7 w-14 rounded-md" />
      ) : (
        <span
          className={`${isPlaceholder ? 'text-xl' : 'text-2xl'} font-display font-bold leading-none tabular-nums ${isPlaceholder ? 'text-text-muted' : 'text-text'}`}
        >
          {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
        </span>
      )}
      {hasTrend && (
        <span className={`text-xs font-display font-semibold tabular-nums ${trendClass}`}>{trend.label}</span>
      )}
      {caption && <span className="text-xs font-display text-text-muted leading-snug line-clamp-2">{caption}</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${MOBILE_TILE_BASE} ${MOBILE_TILE_INTERACTIVE} sm:hidden`}>
        {body}
      </button>
    );
  }
  return <div className={`${MOBILE_TILE_BASE} sm:hidden`}>{body}</div>;
};

/**
 * One headline figure. Below sm it is a plain number-and-label tile (no icon, no ring) so four of
 * them fit a phone two-up; from sm up it is the full StatCard. Meant to sit in a grid.
 */
export const StatTile = memo((props: StatTileProps) => (
  <>
    <MobileStatTile {...props} />
    <div className="hidden sm:flex *:flex-1">
      <StatCard {...props} />
    </div>
  </>
));
StatTile.displayName = 'StatTile';

// ---------------------------------------------------------------------------------------------
// Drill-down
// ---------------------------------------------------------------------------------------------

// DrilldownModal shows at most this many rows, so asking the server for more would only be thrown
// away.
const DRILLDOWN_FETCH_LIMIT = 8;

const ticketRow = (t: Ticket): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tickets?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'CLOSED',
  overdue: t.isOverdue && t.status !== 'CLOSED',
});

type DrilldownKind = 'on-time' | 'overdue';

// What this page calls its headline tiles, in one place so a label never drifts between the tile
// and the modal it opens.
const DRILLDOWN_META: Record<DrilldownKind, { title: string; icon: LucideIcon }> = {
  'on-time': { title: 'Tickets closed on time', icon: ShieldCheck },
  overdue: { title: 'Overdue tickets', icon: AlertTriangle },
};

// The first section on the Overview page: the figures worth a look first. Overdue is a live count
// (open tickets already past their deadline), so it ignores the date picker; the other three cover
// the period named in the heading. With a range picked they total the whole range; with none they
// show the newest period against the one before it.
const AnalyticsSummaryStripBase = ({ groupBy, from, to, onViewSection, isOrgWideRole }: AnalyticsSummaryStripProps) => {
  const headingId = useId();
  const { token } = useAuth();
  const [drilldownKind, setDrilldownKind] = useState<DrilldownKind | null>(null);

  const hasRange = Boolean(from && to);
  const reportGroupBy = hasRange ? 'none' : groupBy;

  const tasks = useTaskComplianceReportQuery(reportGroupBy, from, to);
  const tickets = useTicketTatReportQuery(reportGroupBy, from, to);
  const instances = useChecklistInstanceComplianceReportQuery(reportGroupBy, from, to);
  // Open tickets past their deadline right now: no date range, because "overdue now" is not a
  // question about a period.
  const overdue = useTicketOwnerStatsQuery('org');

  const overdueCount = overdue.data?.[0]?.overdueCount;
  const onTime = useMemo(() => slaMetWithTrend(tickets.data), [tickets.data]);
  const storeChecklists = useMemo(() => latestWithTrend(instances.data, 'completionRate', 'rate'), [instances.data]);
  const delegationItems = useMemo(() => latestWithTrend(tasks.data, 'completionRate', 'rate'), [tasks.data]);

  const onTimePeriod = describeLatestPeriod(tickets.data, reportGroupBy);
  const storePeriod = describeLatestPeriod(instances.data, reportGroupBy);
  const delegationPeriod = describeLatestPeriod(tasks.data, reportGroupBy);

  // The tickets the on-time tile counted: the picked range, or else the newest bucket's own days.
  const onTimeWindow = useMemo(() => {
    if (from && to) return { from, to };
    const latest = tickets.data?.[tickets.data.length - 1];
    return latest ? bucketRange(latest.bucket, reportGroupBy) : null;
  }, [from, to, tickets.data, reportGroupBy]);

  // Fetched only once a tile is opened, with the same definitions the figures use (the server's
  // sla filter), so the list is exactly the tickets that were counted.
  // The window is part of the key (and a precondition) for the on-time list only: the overdue list
  // has no period, so it must not refetch when the page's window changes, and the on-time list must
  // not run before its window is known (it would list every closed ticket).
  const isOnTime = drilldownKind === 'on-time';
  const drilldown = useQuery({
    queryKey: ['analytics', 'ticket-drilldown', drilldownKind, isOnTime ? onTimeWindow?.from : null, isOnTime ? onTimeWindow?.to : null],
    queryFn: () =>
      isOnTime
        ? ticketApi.getAll(1, DRILLDOWN_FETCH_LIMIT, 'CLOSED', undefined, undefined, onTimeWindow?.from, onTimeWindow?.to, 'closedAt', 'closed_on_time')
        : ticketApi.getAll(1, DRILLDOWN_FETCH_LIMIT, undefined, undefined, undefined, undefined, undefined, undefined, 'overdue_open'),
    enabled: !!token && drilldownKind != null && (!isOnTime || onTimeWindow != null),
    retry: handleQueryRetry,
  });
  const drilldownRows = useMemo(() => drilldown.data?.data.map(ticketRow) ?? [], [drilldown.data]);
  const drilldownTotal = drilldown.data?.meta?.total ?? drilldownRows.length;
  const drilldownMeta = drilldownKind ? DRILLDOWN_META[drilldownKind] : null;

  const failed = [overdue, tickets, instances, tasks].filter((q) => q.isError);
  const isStale = [overdue, tickets, instances, tasks].some((q) => q.isPlaceholderData);

  const dim = isStale ? 'opacity-60' : '';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-lg sm:text-xl font-display font-bold text-text">Needs attention</h2>
        <p className="text-sm font-display text-text-muted">{periodHeading(groupBy, from, to)}</p>
      </div>

      {failed.length > 0 && (
        <InlineError message="Some of these numbers did not load." onRetry={() => failed.forEach((q) => void q.refetch())} />
      )}

      <div className="@container">
        <div className={`grid grid-cols-2 gap-3 sm:gap-4 @4xl:grid-cols-4 transition-opacity motion-reduce:transition-none ${dim}`}>
          <StatTile
            icon={AlertTriangle}
            iconTint="text-warning"
            label="Overdue now"
            value={overdue.isError ? NO_DATA_VALUE : overdue.isPending ? LOADING_VALUE : (overdueCount ?? 0)}
            isLoading={overdue.isPending}
            caption={overdue.isPending || overdue.isError ? statCaption({ isPending: overdue.isPending, isError: overdue.isError, hasData: false, noDataText: '' }) : 'Open tickets past their deadline'}
            trend={NO_TREND}
            lowerIsBetter
            onClick={() => setDrilldownKind('overdue')}
          />
          <StatTile
            icon={ShieldCheck}
            iconTint="text-success"
            label="Closed on time"
            value={onTime.value != null ? formatPercent(onTime.value) : tickets.isPending ? LOADING_VALUE : NO_DATA_VALUE}
            isLoading={tickets.isPending}
            trend={onTime.trend}
            caption={
              tickets.isPending || tickets.isError || onTime.value == null
                ? statCaption({ isPending: tickets.isPending, isError: tickets.isError, hasData: onTime.value != null, noDataText: 'No closed tickets with a deadline' })
                : onTimePeriod.label
            }
            onClick={() => setDrilldownKind('on-time')}
          />
          <StatTile
            icon={ClipboardCheck}
            iconTint="text-primary-600 dark:text-primary-400"
            label="Store checklists completion"
            value={storeChecklists.value != null ? formatPercent(storeChecklists.value) : instances.isPending ? LOADING_VALUE : NO_DATA_VALUE}
            isLoading={instances.isPending}
            trend={storeChecklists.trend}
            caption={
              instances.isPending || instances.isError || storeChecklists.value == null
                ? statCaption({ isPending: instances.isPending, isError: instances.isError, hasData: storeChecklists.value != null, noDataText: 'No checklists were due' })
                : storePeriod.label
            }
            onClick={() => onViewSection('store-checklists')}
          />
          <StatTile
            icon={ListChecks}
            iconTint="text-primary-600 dark:text-primary-400"
            label="Delegation checklist items"
            value={delegationItems.value != null ? formatPercent(delegationItems.value) : tasks.isPending ? LOADING_VALUE : NO_DATA_VALUE}
            isLoading={tasks.isPending}
            trend={delegationItems.trend}
            caption={
              tasks.isPending || tasks.isError || delegationItems.value == null
                ? statCaption({ isPending: tasks.isPending, isError: tasks.isError, hasData: delegationItems.value != null, noDataText: 'No checklist items in this period' })
                : delegationPeriod.label
            }
            onClick={() => onViewSection('delegations')}
          />
        </div>
      </div>

      {drilldownMeta && (
        <DrilldownModal
          open
          onClose={() => setDrilldownKind(null)}
          title={drilldownMeta.title}
          icon={drilldownMeta.icon}
          rows={drilldownRows}
          isLoading={drilldown.isPending}
          cappedNote={
            drilldown.isError
              ? 'Could not load this list. Close it and try again.'
              : !drilldown.isPending && drilldownTotal > drilldownRows.length
                ? `Showing the newest ${drilldownRows.length} of ${drilldownTotal}`
                : undefined
          }
          viewAllHref={isOrgWideRole ? '/admin/tickets' : undefined}
          viewAllLabel="View all tickets"
        />
      )}
    </section>
  );
};

export const AnalyticsSummaryStrip = memo(AnalyticsSummaryStripBase);
