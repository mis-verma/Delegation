import { memo, useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  TrendingUp, Sparkles, Plus,
  CheckCircle2, Clock, ShieldCheck, ListChecks, type LucideIcon,
} from 'lucide-react';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PeriodTabControl } from './PeriodTabControl';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import { DeltaBadge } from './RateDelta';
import { isTrendReady, periodElapsedFraction, PERIOD_COMPARE_TITLE } from './trendGate';
import { EntityIconTile, EmptyState, Skeleton } from '../../components';
import { useNow } from '../../lib/useNow';
import {
  type CompliancePeriod,
  MONTH_LABELS,
  PERIOD_END_LABEL,
  PERIOD_LABEL,
  COMPLIANCE_PERIOD_OPTIONS,
  PERIOD_TAB_LABEL,
  periodStartDate,
  shiftPeriod,
  pointDelta,
  isTaskOverdue,
  isTicketLate,
  DASHBOARD_CARD_CLASS,
} from './dashboardDisplay';
import { useChecklistInstanceSummaryQuery, useMyChecklistInstancesQuery } from '../checklist/hook';
import { runScores } from '../checklist/checklistCompliance';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';

// Same row shape/mapping KpiStrip and TeamProgressCard already use for their own drilldowns —
// duplicated locally rather than shared, matching how each of those two already keeps its own
// copy instead of importing one another's.
const taskRow = (t: Task, now: number): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tasks?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'done',
  overdue: isTaskOverdue(t, now),
});

const ticketRow = (t: Ticket): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tickets?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'CLOSED',
  overdue: isTicketLate(t),
});

// Newest-first so a mixed delegations+tickets list interleaves both kinds within the modal's
// 8-row preview instead of one kind burying the other (tasks first, tickets never visible).
const byNewest = (rows: DrilldownRow[]) =>
  [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

interface CompareDashboardProps {
  tasks: Task[];
  tickets: Ticket[];
  period: CompliancePeriod;
  onPeriodChange: (period: CompliancePeriod) => void;
}

const TREND_BUCKET_COUNT: Record<CompliancePeriod, number> = { day: 7, week: 8, month: 6, year: 4 };

/** Chart and its empty state must match exactly or the card resizes when data arrives. */
const COMPARE_CHART_HEIGHT = 220;

// Projection only says something once enough of the period has gone by and there is enough work
// for a straight-line guess to mean anything.
const ESTIMATE_MIN_ELAPSED = 0.25;
const ESTIMATE_MIN_ITEMS = 5;

interface WorkItem {
  createdAt: string;
  completed: boolean;
  // Open and past its deadline, or finished after it.
  late: boolean;
  // `verifiedBy` only gets set by the actual approve step (task.service.ts's verify()/
  // ticket.service.ts's verify()) — a delegation or ticket someone just self-closed without going
  // through review never has it. That's a real, already-tracked "did this pass a review" signal.
  verified: boolean;
}

interface PeriodRates {
  completion: number | null;
  // Of the items that are done or past due, the share that were not late. Open work that is not
  // yet due is in neither count, so a fresh period does not read 100%.
  onTime: number | null;
  // Share of *completed* work that was actually reviewed rather than self-closed — null (not 0)
  // when nothing completed yet in this bucket, same "no activity" convention as completion/onTime.
  reviewed: number | null;
  completedCount: number;
  onTimeCount: number;
  dueCount: number;
  reviewedCount: number;
  total: number;
}

const percent = (count: number, of: number) => (of > 0 ? Math.round((count / of) * 100) : null);

const rateFor = (items: WorkItem[]): PeriodRates => {
  const completedCount = items.filter((i) => i.completed).length;
  const due = items.filter((i) => i.completed || i.late);
  const onTimeCount = due.filter((i) => !i.late).length;
  const reviewedCount = items.filter((i) => i.completed && i.verified).length;
  return {
    completion: percent(completedCount, items.length),
    onTime: percent(onTimeCount, due.length),
    reviewed: percent(reviewedCount, completedCount),
    completedCount,
    onTimeCount,
    dueCount: due.length,
    reviewedCount,
    total: items.length,
  };
};

const bucketLabel = (period: CompliancePeriod, start: Date): string => {
  if (period === 'day') return start.toLocaleDateString(undefined, { weekday: 'short' });
  if (period === 'week') return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (period === 'month') return MONTH_LABELS[start.getMonth()];
  return String(start.getFullYear());
};

// Trailing buckets of the selected granularity ending with the current one — reuses the same
// periodStartDate/shiftPeriod primitives MonthlyTargetCard's own period comparison already relies
// on, so "a week" or "a month" means the exact same thing in both places on this page.
const buildBuckets = (period: CompliancePeriod, count: number, now: Date) =>
  Array.from({ length: count }, (_, i) => {
    const offset = count - 1 - i;
    const start = periodStartDate(period, shiftPeriod(period, now, -offset));
    const end = periodStartDate(period, shiftPeriod(period, now, -offset + 1));
    return { label: bucketLabel(period, start), start, end };
  });

// Checklist runs are keyed by a calendar-day label written as UTC midnight (see todayPeriodBoundIso
// in checklistDisplay), so a period's from/to bounds are the UTC midnights of its first and last
// local days. `to` is inclusive, hence the day taken off the exclusive end.
const dayLabelIso = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
const dayBefore = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);

interface SummaryChipProps {
  label: string;
  value: number | null;
  /** "3 of 4 done" style line under the percent. */
  detail?: string;
  /** Point change vs the last period; null shows no badge. */
  delta: number | null;
  deltaTitle: string;
  dotClassName: string;
  /** Whose work the number covers: the first three are the whole organisation, the checklist chip is yours. */
  scopeTag?: 'Org' | 'Mine';
  isLoading?: boolean;
  onClick: () => void;
}

const SummaryChip = memo(({ label, value, detail, delta, deltaTitle, dotClassName, scopeTag, isLoading = false, onClick }: SummaryChipProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-haspopup="dialog"
    aria-label={`${label}: ${value != null ? `${value}%` : 'No data'}${detail ? `, ${detail}` : ''}. Open the records.`}
    className="flex items-center gap-2.5 w-full min-h-11 px-3.5 py-2.5 rounded-xl border border-border/50 bg-surface-hover/60 text-left transition-colors duration-200 motion-reduce:transition-none cursor-pointer outline-none hover:border-border-hover hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    <span aria-hidden="true" className={`size-2.5 rounded-full shrink-0 ${dotClassName}`} />
    <span className="flex flex-col gap-0.5 min-w-0">
      <span className="flex items-center gap-1.5 text-xs font-display font-medium text-text-muted">
        {label}
        {scopeTag && <span className="px-1.5 rounded-full bg-border/50 text-xs font-semibold text-text-secondary">{scopeTag}</span>}
      </span>
      {isLoading ? (
        <Skeleton className="h-5 w-14 rounded" />
      ) : value != null ? (
        // flex-wrap, not a rigid single row: at 2-up on a narrow phone this chip's own width can
        // be under 150px, too tight for a bold percent, a count and a change badge on one line.
        <span className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
          <span className="text-base font-display font-bold text-text tabular-nums">{value}%</span>
          <DeltaBadge delta={delta} title={deltaTitle} />
        </span>
      ) : (
        <span className="text-xs font-display font-medium text-text-muted">No data</span>
      )}
      {/* Raw count under the percent — "3 of 4" reads very differently from "300 of 400" even at
          the same value, so the count is what makes the percent trustworthy. */}
      {!isLoading && value != null && detail && (
        <span className="text-xs font-display font-medium text-text-muted tabular-nums">{detail}</span>
      )}
    </span>
  </button>
));
SummaryChip.displayName = 'SummaryChip';

interface ChartDatum {
  label: string;
  completion: number | null;
  onTime: number | null;
  /** The newest bucket: still filling up, so it is drawn as a hollow dot and labelled "so far". */
  partial?: boolean;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
}

const ChartTooltip = ({ active, payload }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  const { label, completion, onTime, partial } = payload[0].payload;
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-200">
      <p className="text-xs font-display font-medium text-text-muted capitalize tracking-wide">{label}{partial ? ' (so far)' : ''}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2 rounded-full shrink-0 bg-primary-500" />
        <span className="text-text-muted">Completion</span>
        <span className="font-display font-bold text-text ml-auto">{completion != null ? `${completion}%` : 'No data'}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2 rounded-full shrink-0 bg-activity-ticket" />
        <span className="text-text-muted">On-time</span>
        <span className="font-display font-bold text-text ml-auto">{onTime != null ? `${onTime}%` : 'No data'}</span>
      </div>
    </div>
  );
};

interface Drilldown {
  title: string;
  icon: LucideIcon;
  rows: DrilldownRow[];
  viewAllHref?: string;
  viewAllLabel?: string;
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: ChartDatum;
}

// A solid dot for finished periods and a hollow one for the newest, still-filling period, so its
// natural dip does not read as a real drop.
const makeDot = (color: string) =>
  function SeriesDot({ cx, cy, payload }: DotProps) {
    if (cx == null || cy == null) return <g />;
    return payload?.partial
      ? <circle cx={cx} cy={cy} r={4} fill="var(--color-surface)" stroke={color} strokeWidth={2} />
      : <circle cx={cx} cy={cy} r={3} fill={color} />;
  };
const completionDot = makeDot('var(--color-primary-500)');
const onTimeDot = makeDot('var(--color-activity-ticket)');

const CHART_SERIES = [
  { label: 'Completion', className: 'bg-primary-500' },
  { label: 'On-time', className: 'bg-activity-ticket' },
];

export const CompareDashboard = ({ tasks, tickets, period, onPeriodChange }: CompareDashboardProps) => {
  const gradientId = useId();
  const navigate = useNavigate();
  const now = useNow();

  // Measured off the chart's own rendered box, not the viewport — this card sits in a 2-up grid
  // from `sm` up, so at a "desktop" viewport width it can still render narrower than a full-width
  // mobile card would. A state-backed callback ref re-fires whenever the node itself actually
  // changes (the box only mounts once `hasData` flips true), which a mount-only effect would miss.
  const [chartBoxEl, setChartBoxEl] = useState<HTMLDivElement | null>(null);
  const [chartBoxWidth, setChartBoxWidth] = useState(0);
  useEffect(() => {
    if (!chartBoxEl) return;
    const observer = new ResizeObserver(([entry]) => setChartBoxWidth(entry.contentRect.width));
    observer.observe(chartBoxEl);
    return () => observer.disconnect();
  }, [chartBoxEl]);

  // This period and the one before it, for the checklist counts and the "is it fair to compare yet"
  // gate. Keyed on the period's own boundaries so the minute-by-minute clock does not refetch.
  const periodWindow = useMemo(() => {
    const nowDate = new Date(now);
    const start = periodStartDate(period, nowDate);
    const end = periodStartDate(period, shiftPeriod(period, nowDate, 1));
    const prevStart = periodStartDate(period, shiftPeriod(period, nowDate, -1));
    return { start, end, prevStart };
  }, [period, now]);
  const currentFrom = dayLabelIso(periodWindow.start);
  const currentTo = dayLabelIso(dayBefore(periodWindow.end));
  const previousFrom = dayLabelIso(periodWindow.prevStart);
  const previousTo = dayLabelIso(dayBefore(periodWindow.start));

  // Counted server-side rather than by reducing over every hydrated instance — see
  // useChecklistInstanceSummaryQuery for why that mattered. One call per period so the chip can
  // show a change vs the last one.
  const { data: checklistNow, isPending: checklistPending } = useChecklistInstanceSummaryQuery(
    { mine: true, from: currentFrom, to: currentTo },
    { keepPrevious: true },
  );
  const { data: checklistBefore } = useChecklistInstanceSummaryQuery(
    { mine: true, from: previousFrom, to: previousTo },
    { keepPrevious: true },
  );
  const checklistTotalItems = checklistNow?.totalItems ?? 0;
  const checklistDoneItems = checklistNow?.doneItems ?? 0;
  const checklistRate = percent(checklistDoneItems, checklistTotalItems);
  const checklistPrevRate = checklistBefore ? percent(checklistBefore.doneItems, checklistBefore.totalItems) : null;

  // Only fetched for the checklist chip's own drilldown rows — the headline % above comes from the
  // cheaper server-side summary, same "recent preview, not a second unbounded list" capped window
  // KpiStrip's own checklist card already uses.
  const { data: checklistInstances = [] } = useMyChecklistInstancesQuery({}, { limit: 25 });

  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  const { chartData, current, previous, projection, completionRows, onTimeRows, reviewedRows, checklistRows, trendReady } = useMemo(() => {
    const nowDate = new Date(now);
    const taskLate = (t: Task) =>
      isTaskOverdue(t, now) ||
      (t.status === 'done' && !!t.dueDate && new Date(t.verifiedAt ?? t.updatedAt).getTime() > new Date(t.dueDate).getTime());

    const items: WorkItem[] = [
      ...tasks.map((t) => ({
        createdAt: t.createdAt,
        completed: t.status === 'done',
        late: taskLate(t),
        verified: t.verifiedBy != null,
      })),
      ...tickets.map((t) => ({
        createdAt: t.createdAt,
        completed: t.status === 'CLOSED',
        late: isTicketLate(t),
        verified: t.verifiedBy != null,
      })),
    ];

    const inRange = (start: Date, end: Date) =>
      items.filter((i) => {
        const t = new Date(i.createdAt).getTime();
        return t >= start.getTime() && t < end.getTime();
      });

    const buckets = buildBuckets(period, TREND_BUCKET_COUNT[period], nowDate);
    const bucketRates = buckets.map((b) => rateFor(inRange(b.start, b.end)));
    const data: ChartDatum[] = buckets.map((b, i) => ({
      label: b.label,
      completion: bucketRates[i].completion,
      onTime: bucketRates[i].onTime,
      partial: i === buckets.length - 1,
    }));

    const currentRates = bucketRates[bucketRates.length - 1];
    const previousRates = bucketRates[bucketRates.length - 2] ?? rateFor([]);

    const currentStart = buckets[buckets.length - 1].start;
    const currentEnd = buckets[buckets.length - 1].end;
    const elapsed = periodElapsedFraction(currentStart.getTime(), currentEnd.getTime(), now);
    // A straight-line guess, only offered once a quarter of the period has gone and there are
    // enough items for it to mean something (and not once the period is effectively over).
    const projected =
      elapsed >= ESTIMATE_MIN_ELAPSED && elapsed < 0.98 && currentRates.total >= ESTIMATE_MIN_ITEMS
        ? Math.round(currentRates.completedCount / elapsed)
        : null;

    // Kind split for the current bucket only — the chips above show a blended delegations+tickets
    // number, so "which of those actually make up this %" is exactly what tapping a chip answers.
    const inCurrentBucket = (createdAt: string) => {
      const t = new Date(createdAt).getTime();
      return t >= currentStart.getTime() && t < currentEnd.getTime();
    };
    const currentTasks = tasks.filter((t) => inCurrentBucket(t.createdAt));
    const currentTickets = tickets.filter((t) => inCurrentBucket(t.createdAt));

    // Real record lists behind each chip's percent — same "tap for the exact records" modal
    // KpiStrip/TeamProgressCard already use, not just an aggregate count.
    const completion = byNewest([
      ...currentTasks.filter((t) => t.status === 'done').map((t) => taskRow(t, now)),
      ...currentTickets.filter((t) => t.status === 'CLOSED').map(ticketRow),
    ]);
    // Finished on time. Open work not yet due is not on this list, matching the denominator.
    const onTime = byNewest([
      ...currentTasks.filter((t) => t.status === 'done' && !taskLate(t)).map((t) => taskRow(t, now)),
      ...currentTickets.filter((t) => t.status === 'CLOSED' && !isTicketLate(t)).map(ticketRow),
    ]);
    // Denominator is completed items, not all items: how much of what is done was actually reviewed.
    const reviewed = byNewest([
      ...currentTasks.filter((t) => t.status === 'done' && t.verifiedBy != null).map((t) => taskRow(t, now)),
      ...currentTickets.filter((t) => t.status === 'CLOSED' && t.verifiedBy != null).map(ticketRow),
    ]);

    // N/A-aware: a not-applicable question is out of both sides, so a run with only N/A left over
    // still counts as finished.
    const checklists = checklistInstances
      .filter((c) => inCurrentBucket(c.generatedAt))
      .filter((c) => {
        const scores = runScores(c.items);
        return scores.total > 0 && scores.done === scores.total;
      })
      .map((c): DrilldownRow => ({
        id: c.id,
        title: c.title,
        link: `/checklists/${c.id}`,
        createdAt: c.generatedAt,
        completed: true,
        overdue: false,
      }));

    return {
      chartData: data,
      current: currentRates,
      previous: previousRates,
      projection: projected,
      completionRows: completion,
      onTimeRows: onTime,
      reviewedRows: reviewed,
      checklistRows: byNewest(checklists),
      trendReady: isTrendReady(currentStart.getTime(), currentEnd.getTime(), now),
    };
  }, [tasks, tickets, checklistInstances, period, now]);

  const hasData = chartData.some((d) => d.completion != null || d.onTime != null);
  // Up to date as long as the period is at least half over; before that the last period is
  // complete and this one is not, so no change is shown (see isTrendReady).
  const delta = (cur: number | null, prev: number | null) => (trendReady ? pointDelta(cur, prev) : null);
  const deltaTitle = PERIOD_COMPARE_TITLE[period];

  const latest = chartData[chartData.length - 1];
  const unit = period === 'day' ? 'days' : `${period}s`;
  const chartSummary = `Area chart of completion and on-time rates over the last ${chartData.length} ${unit}. ${
    latest ? `Latest, ${latest.label}: completion ${latest.completion != null ? `${latest.completion}%` : 'no data'}, on-time ${latest.onTime != null ? `${latest.onTime}%` : 'no data'}.` : ''
  }`;

  return (
    // `p-4 sm:p-6 lg:p-7` matches MonthlyTargetCard, which shares this card's row. `flex flex-col
    // gap-4` gives the vertical rhythm one owner instead of every block declaring its own margin.
    <section aria-labelledby="compare-dashboard-heading" className={`@container flex flex-col gap-4 ${DASHBOARD_CARD_CLASS} p-4 sm:p-6 lg:p-7`}>
      {/* `@xl:flex-row`, not `sm:flex-row` — this card sits in a 2-up grid from the viewport's own
          `sm` up, so at exactly that crossover the card is already halved, and a viewport-based
          breakpoint switched to a row layout before the card actually had the width for it.
          Keying off the card's own measured width keeps this row stacked until it fits. */}
      <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <EntityIconTile icon={TrendingUp} />
          <div>
            <h2 id="compare-dashboard-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">Compare Dashboard</h2>
            {/* Every rate below is of items CREATED in the period, compared with the period before.
                Shown on phones too: without it the numbers read as "everything finished". */}
            <p className="text-xs font-medium text-text-muted mt-0.5">
              Of items created {PERIOD_LABEL[period]}, compared with {deltaTitle.replace('vs ', '')}
            </p>
          </div>
        </div>

        <PeriodTabControl value={period} options={COMPLIANCE_PERIOD_OPTIONS} labels={PERIOD_TAB_LABEL} onChange={onPeriodChange} />
      </div>

      {/* "On-time" used index.css's `coral` accent before — its own doc comment scopes coral to
          decorative use, and its gold hue reads too close to `warning` for a metric that's
          actually good news. `info` also matches the primary/info pairing used for the two series. */}
      <div className="grid grid-cols-2 @sm:grid-cols-4 gap-2">
        <SummaryChip
          label="Completion"
          value={current.completion}
          scopeTag="Org"
          detail={`${current.completedCount} of ${current.total} done`}
          delta={delta(current.completion, previous.completion)}
          deltaTitle={deltaTitle}
          dotClassName="bg-primary-500"
          onClick={() => setDrilldown({ title: `Completed ${PERIOD_LABEL[period]}`, icon: CheckCircle2, rows: completionRows })}
        />
        <SummaryChip
          label="On-time"
          value={current.onTime}
          scopeTag="Org"
          detail={`${current.onTimeCount} of ${current.dueCount} due`}
          delta={delta(current.onTime, previous.onTime)}
          deltaTitle={deltaTitle}
          dotClassName="bg-activity-ticket"
          onClick={() => setDrilldown({ title: `Finished on time ${PERIOD_LABEL[period]}`, icon: Clock, rows: onTimeRows })}
        />
        <SummaryChip
          label="Reviewed rate"
          value={current.reviewed}
          scopeTag="Org"
          detail={`${current.reviewedCount} of ${current.completedCount} done`}
          delta={delta(current.reviewed, previous.reviewed)}
          deltaTitle={deltaTitle}
          dotClassName="bg-activity-delegation"
          onClick={() => setDrilldown({ title: `Reviewed ${PERIOD_LABEL[period]}`, icon: ShieldCheck, rows: reviewedRows })}
        />
        <SummaryChip
          label="My checklist items"
          value={checklistRate}
          scopeTag="Mine"
          detail={`${checklistDoneItems} of ${checklistTotalItems} items`}
          delta={delta(checklistRate, checklistPrevRate)}
          deltaTitle={deltaTitle}
          dotClassName="bg-success"
          isLoading={checklistPending}
          onClick={() => setDrilldown({
            title: 'Completed checklists',
            icon: ListChecks,
            rows: checklistRows,
            viewAllHref: '/checklists?status=completed',
            viewAllLabel: 'View all in Checklist',
          })}
        />
      </div>

      {!trendReady && (
        <p className="text-xs font-medium text-text-muted">
          Changes vs {deltaTitle.replace('vs ', '')} show once this {period} is half over.
        </p>
      )}

      {/* Trend line is desktop-only — the four chips above already carry the actionable numbers
          (each opens its own drilldown), so on a phone the chart was extra height behind a toggle. */}
      <div className="hidden sm:contents">
        {/* An explicit two-item key next to the chart: the third chip (checklist) is not plotted, so
            reading the chip dots as a legend would mislead. */}
        <div className="flex items-center gap-4">
          {CHART_SERIES.map((series) => (
            <div key={series.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2 rounded-full shrink-0 ${series.className}`} />
              <span className="text-xs font-display font-medium text-text-muted">{series.label}</span>
            </div>
          ))}
          <span className="flex items-center gap-1.5 text-xs font-display font-medium text-text-muted">
            <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-text-muted bg-surface shrink-0" />
            This {period} so far
          </span>
        </div>

        {hasData ? (
          <>
            <div ref={setChartBoxEl} role="img" aria-label={chartSummary} className="w-full" style={{ height: COMPARE_CHART_HEIGHT }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} accessibilityLayer={false} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`compFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary-500)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-primary-500)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`onTimeFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-activity-ticket)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-activity-ticket)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    // Thinning to roughly one label per 50px of this chart's own measured width
                    // keeps every period readable at whatever width it actually renders at.
                    interval={
                      chartBoxWidth > 0 && chartData.length > Math.max(2, Math.floor(chartBoxWidth / 50))
                        ? Math.ceil(chartData.length / Math.max(2, Math.floor(chartBoxWidth / 50))) - 1
                        : 0
                    }
                    padding={{ left: 16, right: 16 }}
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500 }}
                    dy={10}
                  />

                  {/* Both series are percentages: pinning 0-100 is the honest scale, so a 4-point
                      difference does not look like a collapse. The axis is hidden on a narrow
                      render, where the gutter costs more than the reading is worth. */}
                  {chartBoxWidth === 0 || chartBoxWidth >= 300 ? (
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={36}
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickFormatter={(value: number) => `${value}%`}
                      tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }}
                    />
                  ) : (
                    // Still needs the domain even with the axis hidden, or the plot rescales to the
                    // data range the moment the labels disappear.
                    <YAxis hide domain={[0, 100]} />
                  )}

                  <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" strokeOpacity={0.4} />

                  <Tooltip cursor={{ stroke: 'var(--color-border-hover)' }} content={<ChartTooltip />} />
                  {/* A small persistent dot keeps sparse or isolated points visible: with only a
                      bucket or two of real data a point has no line to connect to. */}
                  <Area
                    type="monotone"
                    dataKey="completion"
                    stroke="var(--color-primary-500)"
                    strokeWidth={2.5}
                    fill={`url(#compFill-${gradientId})`}
                    dot={completionDot}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-surface)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="onTime"
                    stroke="var(--color-activity-ticket)"
                    strokeWidth={2.5}
                    fill={`url(#onTimeFill-${gradientId})`}
                    dot={onTimeDot}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-surface)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* The same numbers as a plain table for screen readers. */}
            <table className="sr-only">
              <caption>Completion and on-time rates by {period}</caption>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Completion</th>
                  <th scope="col">On-time</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((d) => (
                  <tr key={d.label}>
                    <th scope="row">{d.label}</th>
                    <td>{d.completion != null ? `${d.completion}%` : 'No data'}</td>
                    <td>{d.onTime != null ? `${d.onTime}%` : 'No data'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          // Same reserved height as the loaded chart, so the card does not resize when data
          // arrives. The inner EmptyState is stretched to fill it.
          <div className="flex flex-col [&>*]:h-full [&>*]:py-2" style={{ height: COMPARE_CHART_HEIGHT }}>
            <EmptyState
              icon={TrendingUp}
              title="Nothing to compare yet"
              description="This fills in once your team logs its first delegation or ticket."
              action={{ label: 'New delegation', icon: Plus, onClick: () => navigate('/tasks?create=1') }}
            />
          </div>
        )}
      </div>

      {projection != null && (
        <div className="hidden sm:flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-primary-500/5 border border-primary-500/10 text-xs font-display font-medium text-text-secondary">
          <Sparkles size={14} className="text-primary-500 shrink-0" aria-hidden="true" />
          <span>
            Estimate: about <span className="font-bold text-text">{projection}</span> done by {PERIOD_END_LABEL[period]} if this pace holds.
          </span>
        </div>
      )}

      {/* Same "tap a stat, see the exact records" modal as the KPI strip and Team's progress card
          above it on this page — one interaction language for every stat on the Dashboard. */}
      {drilldown && (
        <DrilldownModal
          open
          onClose={() => setDrilldown(null)}
          title={drilldown.title}
          icon={drilldown.icon}
          rows={drilldown.rows}
          viewAllHref={drilldown.viewAllHref}
          viewAllLabel={drilldown.viewAllLabel}
        />
      )}
    </section>
  );
};
