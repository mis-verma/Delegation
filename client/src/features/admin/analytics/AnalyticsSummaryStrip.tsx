import { memo, useId, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, ClipboardX, Hourglass, ListChecks, ShieldCheck, type LucideIcon, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { StatCard, type Trend } from '../../dashboard';
import { DrilldownModal, type DrilldownRow } from '../../dashboard/DrilldownModal';
import { ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { useAuth } from '../../../context/AuthContext';
import { ticketApi } from '../../../api/ticket';
import { checklistDrillHref, overdueDelegationsHref } from '../../dashboard/scoreDrill';
import { HowCalculated } from '../../scores/HowCalculated';
import { SectionHeader } from '../../scores/SectionHeader';
import { MODULE_LABEL, SCORE_LABEL } from '../../../lib/scoreLabels';
import { useOverviewScores } from './useOverviewScores';
import { UpdatingNote } from './UpdatingNote';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { useTicketOwnerStatsQuery, useTaskOwnerStatsQuery } from './useAnalyticsQueries';
import { formatPercent, NO_TREND, periodHeading, statCaption } from './analyticsDisplay';
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
  /** The window the missed-checklist count covers: the picked range, or the page's default window. */
  windowFrom?: string;
  windowTo?: string;
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
  /** Sits beside the label: a "how is this calculated" popover. */
  labelAdornment?: ReactNode;
}

// Written placeholders for a tile that has no figure: never a bare dash standing in for a value.
const NO_DATA_VALUE = 'No data';
const LOADING_VALUE = 'Loading';
// A request that failed is not the same as "nothing happened": say it did not load.
const UNAVAILABLE_VALUE = 'Unavailable';

const MOBILE_TILE_BASE = `${PANEL_CLASS} flex flex-col gap-1 p-3 text-left min-w-0`;
const MOBILE_TILE_INTERACTIVE =
  'cursor-pointer transition-colors duration-150 motion-reduce:transition-none hover:border-border-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50';

const MobileStatTile = ({ label, value, caption, trend, lowerIsBetter = false, isLoading, onClick, labelAdornment }: StatTileProps) => {
  const hasTrend = trend != null && trend.label !== '—';
  // A change of zero is neither good nor bad, same as StatCard.
  const isFlat = hasTrend && Number.parseFloat(trend.label) === 0;
  const isGood = trend ? (trend.direction === 'up') !== lowerIsBetter : true;
  const trendClass = isFlat ? 'text-text-muted' : isGood ? 'text-success' : 'text-danger';
  const isPlaceholder = value === NO_DATA_VALUE || value === LOADING_VALUE || value === UNAVAILABLE_VALUE;
  const body = (
    <>
      <span className="flex items-start gap-1.5">
        <span className="t-meta font-display font-semibold text-text-muted leading-snug break-words">{label}</span>
        {labelAdornment && (
          // A control inside a tappable tile: its taps and keys stop here instead of opening the tile.
          <span className="inline-flex shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {labelAdornment}
          </span>
        )}
      </span>
      {isLoading ? (
        <Skeleton className="h-7 w-14 rounded-md" />
      ) : (
        <span
          className={`${isPlaceholder ? 't-card' : 't-stat'} font-display font-bold leading-none tabular-nums ${isPlaceholder ? 'text-text-muted' : 'text-text'}`}
        >
          {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
        </span>
      )}
      {hasTrend && (
        <span className={`inline-flex items-center gap-1 t-meta font-display font-semibold tabular-nums ${trendClass}`}>
          {isFlat ? <Minus className="size-3" aria-hidden="true" /> : trend.direction === 'up' ? <ArrowUpRight className="size-3" aria-hidden="true" /> : <ArrowDownRight className="size-3" aria-hidden="true" />}
          {trend.label}
        </span>
      )}
      {caption && <span className="t-meta font-display text-text-muted leading-snug line-clamp-2">{caption}</span>}
    </>
  );

  if (onClick) {
    // A div, not a button: the label can hold its own button (the popover), and a button cannot sit inside a button.
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={`${MOBILE_TILE_BASE} ${MOBILE_TILE_INTERACTIVE} sm:hidden`}
      >
        {body}
      </div>
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


// The tile names, built from the one label dictionary so they read the same as the Scores page.
const TICKETS_ON_TIME = `${MODULE_LABEL.ticket} ${SCORE_LABEL.onTime.toLowerCase()}`;
const CHECKLISTS_NOT_DONE = `${MODULE_LABEL.checklist} ${SCORE_LABEL.notDone.toLowerCase()}`;
const CHECKLISTS_COMPLETION = `${MODULE_LABEL.checklist} ${SCORE_LABEL.completion.toLowerCase()}`;
const DELEGATIONS_COMPLETION = `${MODULE_LABEL.delegation} ${SCORE_LABEL.completion.toLowerCase()}`;

// The first section on the Overview page: the figures worth a look first. Overdue is a live count
// (open tickets already past their deadline), so it ignores the date picker. Every percentage covers the
// Overview's window and comes from the score explorer (the same answer the Scores page shows), so there
// is no change-versus-last-period badge here: the explorer has one figure per window, not per bucket.
const AnalyticsSummaryStripBase = ({ groupBy, from, to, onViewSection, isOrgWideRole, windowFrom, windowTo }: AnalyticsSummaryStripProps) => {
  const headingId = useId();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [drilldownKind, setDrilldownKind] = useState<DrilldownKind | null>(null);

  // Open tickets past their deadline right now: no date range, because "overdue now" is not a
  // question about a period.
  const overdue = useTicketOwnerStatsQuery('org');

  // Delegations past their due date and not done (waiting-for-approval work has stopped the clock), live.
  const overdueDelegations = useTaskOwnerStatsQuery('org');
  const overdueDelegationCount = overdueDelegations.data?.[0]?.overdueCount;

  // Every score figure: the explorer's whole-window row. Admin and PC see the organisation, a head their department.
  const scores = useOverviewScores(windowFrom, windowTo);
  const dayFrom = scores.win?.from;
  const dayTo = scores.win?.to;
  const windowText = scores.win?.label ?? '';
  const checklist = scores.total?.checklist;
  const ticket = scores.total?.ticket;
  const delegation = scores.total?.delegation;
  const checklistSubject = isOrgWideRole ? { kind: 'org' as const } : user?.departmentId ? { kind: 'department' as const, id: user.departmentId } : null;
  const scoresFailed = scores.isError && !scores.data;
  const scoresLoading = scores.isPending && !scores.data;
  const missedCount = checklist?.notDone ?? 0;
  const lateChecklists = checklist?.late ?? 0;

  const overdueCount = overdue.data?.[0]?.overdueCount;

  // A percentage tile: the figure, or a written reason there is none. `count` is what the percentage is of
  // (finished for on time, due for completion): zero means there is nothing to show.
  const percentValue = (value: number | null | undefined, count: number | undefined) =>
    scoresFailed ? UNAVAILABLE_VALUE : scoresLoading || !scores.total ? LOADING_VALUE : !count || value == null ? NO_DATA_VALUE : formatPercent(value);
  const percentCaption = (value: number | null | undefined, count: number | undefined, noDataText: string) =>
    scoresLoading || scoresFailed || !count || value == null
      ? statCaption({ isPending: scoresLoading, isError: scoresFailed, hasData: !!count && value != null, noDataText })
      : windowText;

  // The tickets the on-time tile counted: the Overview's window, so the list covers the same days as the figure.
  const onTimeWindow = useMemo(() => (windowFrom && windowTo ? { from: windowFrom, to: windowTo } : from && to ? { from, to } : null), [windowFrom, windowTo, from, to]);

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

  const failed = [overdue, overdueDelegations, scores].filter((q) => q.isError);
  // The headline numbers as label and value. A figure that did not load is left empty.
  const exportRows = (): TableRows => [
    ['Figure', 'Value', 'Covers'],
    ['Overdue tickets', overdue.isError ? null : overdueCount ?? 0, 'Open tickets past their deadline, right now'],
    ['Overdue delegations', overdueDelegations.isError ? null : overdueDelegationCount ?? 0, 'Delegations past their due date and not done, right now'],
    [CHECKLISTS_NOT_DONE, !checklist ? null : missedCount, `Runs that came due and were not finished, ${windowText}`],
    [`${TICKETS_ON_TIME} %`, exportPct(ticket?.onTimeOfFinishedPct), windowText],
    [`${CHECKLISTS_COMPLETION} %`, exportPct(checklist?.completion), windowText],
    [`${DELEGATIONS_COMPLETION} %`, exportPct(delegation?.completion), windowText],
  ];
  const anyPending = [overdue, overdueDelegations].some((q) => q.isPending) || scoresLoading;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader
        id={headingId}
        title="At a glance"
        actions={
          <>
            <UpdatingNote show={scores.updating} />
            <p className="t-meta font-display text-text-muted">{periodHeading(groupBy, from, to)}</p>
            <ExportMenu
              disabled={anyPending}
              aria-label="Export the headline numbers"
              filename="overview-at-a-glance"
              sheetName="At a glance"
              title={exportTitle({ what: 'Overview, at a glance', from, to, period: from && to ? undefined : periodHeading(groupBy, from, to) })}
              getRows={exportRows}
            />
          </>
        }
      />

      {failed.length > 0 && (
        <InlineError message="Some of these numbers did not load." onRetry={() => failed.forEach((q) => void q.refetch())} />
      )}

      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-3">
          <StatTile
            icon={AlertTriangle}
            iconTint="text-warning"
            label="Overdue tickets"
            value={overdue.isError ? UNAVAILABLE_VALUE : overdue.isPending ? LOADING_VALUE : (overdueCount ?? 0)}
            isLoading={overdue.isPending}
            caption={overdue.isPending || overdue.isError ? statCaption({ isPending: overdue.isPending, isError: overdue.isError, hasData: false, noDataText: '' }) : 'Open tickets past their deadline'}
            trend={NO_TREND}
            lowerIsBetter
            onClick={() => setDrilldownKind('overdue')}
          />
          <StatTile
            icon={Hourglass}
            iconTint="text-warning"
            label="Overdue delegations"
            value={overdueDelegations.isError ? UNAVAILABLE_VALUE : overdueDelegations.isPending ? LOADING_VALUE : (overdueDelegationCount ?? 0)}
            isLoading={overdueDelegations.isPending}
            caption={overdueDelegations.isPending || overdueDelegations.isError ? statCaption({ isPending: overdueDelegations.isPending, isError: overdueDelegations.isError, hasData: false, noDataText: '' }) : 'Past their due date, not done'}
            trend={NO_TREND}
            lowerIsBetter
            onClick={() => navigate(overdueDelegationsHref())}
          />
          {checklistSubject && (
            <StatTile
              icon={ClipboardX}
              iconTint="text-warning"
              label={CHECKLISTS_NOT_DONE}
              value={scoresFailed ? UNAVAILABLE_VALUE : !checklist ? LOADING_VALUE : missedCount}
              isLoading={scoresLoading}
              caption={scoresLoading || scoresFailed ? statCaption({ isPending: scoresLoading, isError: scoresFailed, hasData: false, noDataText: '' }) : lateChecklists > 0 ? `Not finished, plus ${lateChecklists} finished late` : 'Came due and not finished'}
              trend={NO_TREND}
              lowerIsBetter
              onClick={() => {
                if (dayFrom && dayTo) navigate(checklistDrillHref(isOrgWideRole, checklistSubject, dayFrom, dayTo, 'notDone'));
              }}
            />
          )}
          <StatTile
            icon={ShieldCheck}
            iconTint="text-success"
            label={TICKETS_ON_TIME}
            labelAdornment={<HowCalculated figure="onTime" module="ticket" />}
            value={percentValue(ticket?.onTimeOfFinishedPct, ticket?.done)}
            isLoading={scoresLoading}
            trend={NO_TREND}
            caption={percentCaption(ticket?.onTimeOfFinishedPct, ticket?.done, 'No closed tickets with a deadline')}
            onClick={() => setDrilldownKind('on-time')}
          />
          <StatTile
            icon={ClipboardCheck}
            iconTint="text-primary-600 dark:text-primary-400"
            label={CHECKLISTS_COMPLETION}
            labelAdornment={<HowCalculated figure="completion" module="checklist" />}
            value={percentValue(checklist?.completion, checklist?.due)}
            isLoading={scoresLoading}
            trend={NO_TREND}
            caption={percentCaption(checklist?.completion, checklist?.due, 'No checklists were due')}
            onClick={() => onViewSection('store-checklists')}
          />
          <StatTile
            icon={ListChecks}
            iconTint="text-primary-600 dark:text-primary-400"
            label={DELEGATIONS_COMPLETION}
            labelAdornment={<HowCalculated figure="completion" module="delegation" />}
            value={percentValue(delegation?.completion, delegation?.due)}
            isLoading={scoresLoading}
            trend={NO_TREND}
            caption={percentCaption(delegation?.completion, delegation?.due, 'No delegations were due')}
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
