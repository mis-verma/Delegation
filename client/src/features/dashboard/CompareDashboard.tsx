import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  TrendingUp, ArrowUpRight, ArrowDownRight, Minus, Sparkles, Plus,
  CheckCircle2, Clock, ShieldCheck, ListChecks, type LucideIcon,
} from 'lucide-react';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PeriodTabControl } from './PeriodTabControl';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import { EntityIconTile, Button } from '../../components';
import {
  type CompliancePeriod,
  MONTH_LABELS,
  PERIOD_END_LABEL,
  COMPLIANCE_PERIOD_OPTIONS,
  PERIOD_TAB_LABEL,
  periodStartDate,
  shiftPeriod,
  pointDelta,
  DASHBOARD_CARD_CLASS,
} from './dashboardDisplay';
import { useChecklistInstanceSummaryQuery, useMyChecklistInstancesQuery } from '../checklist/hook';
import { isInstanceOverdue } from '../checklist/checklistDisplay';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';

// Same row shape/mapping KpiStrip and TeamProgressCard already use for their own drilldowns —
// duplicated locally rather than shared, matching how each of those two already keeps its own
// copy instead of importing one another's.
const taskRow = (t: Task): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tasks?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'done',
  overdue: t.status !== 'done' && !!t.dueDate && new Date(t.dueDate).getTime() < Date.now(),
});

const ticketRow = (t: Ticket): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tickets?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'CLOSED',
  overdue: t.isOverdue,
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

interface WorkItem {
  createdAt: string;
  completed: boolean;
  overdue: boolean;
  // `verifiedBy` only gets set by the actual approve step (task.service.ts's verify()/
  // ticket.service.ts's verify()) — a delegation or ticket someone just self-closed without going
  // through review never has it. That's a real, already-tracked "did this pass a quality check"
  // signal, not a fabricated one.
  verified: boolean;
}

interface PeriodRates {
  completion: number | null;
  onTime: number | null;
  // Share of *completed* work that was actually verified rather than self-closed — null (not 0)
  // when nothing completed yet in this bucket, same "no activity" convention as completion/onTime.
  quality: number | null;
  completedCount: number;
  onTimeCount: number;
  qualityCount: number;
  total: number;
}

const rateFor = (items: WorkItem[]): PeriodRates => {
  const completedCount = items.filter((i) => i.completed).length;
  const overdueCount = items.filter((i) => i.overdue).length;
  const qualityCount = items.filter((i) => i.completed && i.verified).length;
  return {
    completion: items.length ? Math.round((completedCount / items.length) * 100) : null,
    onTime: items.length ? Math.round(((items.length - overdueCount) / items.length) * 100) : null,
    quality: completedCount ? Math.round((qualityCount / completedCount) * 100) : null,
    completedCount,
    onTimeCount: items.length - overdueCount,
    qualityCount,
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

interface SummaryChipProps {
  label: string;
  value: number | null;
  previous: number | null;
  dotClassName: string;
  count?: number;
  total?: number;
  onClick: () => void;
}

const SummaryChip = ({ label, value, previous, dotClassName, count, total, onClick }: SummaryChipProps) => {
  const delta = value != null && previous != null ? pointDelta(value, previous) : null;
  // pointDelta always signs its label ("+0.0%", never a bare "0%"), so an unchanged metric has to
  // be detected by parsing the number back out — otherwise "no change" rendered as a green upward
  // arrow, claiming improvement where there was none. Same fix the Compliance gauges already have.
  const isFlat = delta != null && Number.parseFloat(delta.label) === 0;
  const TrendIcon = isFlat ? Minus : delta?.direction === 'up' ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      aria-label={`${label}, ${value != null ? `${value}%` : 'no activity yet'}. Tap to see the records.`}
      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border/50 bg-surface-hover/60 transition-colors duration-200 cursor-pointer outline-none hover:border-border-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <span className={`size-2.5 rounded-full shrink-0 ${dotClassName}`} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] font-display font-medium text-text-muted whitespace-nowrap">{label}</span>
        {value != null ? (
          // flex-wrap, not a rigid single row — at 2-up on a narrow phone this chip's own width can
          // be under 150px, too tight for a bold percent plus a count plus a trend badge to share
          // one line. Without it the count span wrapped word-by-word ("(2" / "of" / "3)" on three
          // separate lines) and the trend badge ran past the card's own right edge. whitespace-nowrap
          // on the count keeps it wrapping as one unit instead of breaking mid-phrase.
          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
            <span className="text-base font-display font-bold text-text tabular-nums">{value}%</span>
            {/* Raw count next to the percent — "3 of 4" reads very differently from "300 of 400"
                even at the same value, so the count is what makes the percent trustworthy. */}
            {total != null && total > 0 && (
              <span className="text-[10px] font-display font-medium text-text-light tabular-nums whitespace-nowrap">
                ({count} of {total})
              </span>
            )}
            {delta && (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold whitespace-nowrap ${isFlat ? 'text-text-muted' : delta.direction === 'up' ? 'text-success' : 'text-danger'}`}>
                <TrendIcon size={10} strokeWidth={3} />
                {delta.label}
              </span>
            )}
          </div>
        ) : (
          // A bare "—" with no context reads as broken rather than "nothing created yet in this
          // bucket" — spell out the latter, matching Delegation Score's "No delegations created
          // this month" for the same underlying reason (zero items in the current period).
          <span className="text-[11px] font-display font-medium text-text-light">No activity yet</span>
        )}
      </div>
    </div>
  );
};

interface ChartDatum {
  label: string;
  completion: number | null;
  onTime: number | null;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
}

const ChartTooltip = ({ active, payload }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  const { label, completion, onTime } = payload[0].payload;
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-200">
      <p className="text-xs font-display font-medium text-text-muted capitalize tracking-wide">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2 rounded-full shrink-0 bg-primary-500" />
        <span className="text-text-muted">Completion</span>
        <span className="font-display font-bold text-text ml-auto">{completion != null ? `${completion}%` : '—'}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2 rounded-full shrink-0 bg-info" />
        <span className="text-text-muted">On-time</span>
        <span className="font-display font-bold text-text ml-auto">{onTime != null ? `${onTime}%` : '—'}</span>
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

export const CompareDashboard = ({ tasks, tickets, period, onPeriodChange }: CompareDashboardProps) => {
  const gradientId = useId();
  const navigate = useNavigate();

  // Measured off the chart's own rendered box, not the viewport — this card sits in a 2-up grid
  // from `sm` up, so at a "desktop" viewport width it can still render narrower than a full-width
  // mobile card would. A viewport-based mobile check picked "show every label" right at that
  // crossover (e.g. this card halved into a 768px-wide tablet's 2-column layout), which is exactly
  // what crammed 8 "week" labels into ~300px and smeared them into an unreadable overlap.
  // A plain `useRef` + `useEffect(fn, [])` doesn't work here: this box only mounts once `hasData`
  // is true, which flips well after the tasks/tickets queries resolve — by the time it exists, the
  // mount-only effect has already run once (against a still-null ref) and never runs again. A
  // state-backed callback ref re-fires whenever the node itself actually changes, mount included.
  const [chartBoxEl, setChartBoxEl] = useState<HTMLDivElement | null>(null);
  const [chartBoxWidth, setChartBoxWidth] = useState(0);
  useEffect(() => {
    if (!chartBoxEl) return;
    const observer = new ResizeObserver(([entry]) => setChartBoxWidth(entry.contentRect.width));
    observer.observe(chartBoxEl);
    return () => observer.disconnect();
  }, [chartBoxEl]);
  // Counted server-side rather than by reducing over every hydrated instance — see
  // useChecklistInstanceSummaryQuery for why that mattered.
  const { data: checklistSummary } = useChecklistInstanceSummaryQuery({ mine: true });
  const checklistTotalItems = checklistSummary?.totalItems ?? 0;
  const checklistDoneItems = checklistSummary?.doneItems ?? 0;
  const checklistCompliance = checklistTotalItems > 0 ? Math.round((checklistDoneItems / checklistTotalItems) * 100) : null;
  // Only fetched for the Checklist chip's own drilldown rows — the headline % above still comes
  // from the cheaper server-side summary, same "recent preview, not a second unbounded list"
  // capped window KpiStrip's own checklist card already uses.
  const { data: checklistInstances = [] } = useMyChecklistInstancesQuery({}, { limit: 25 });
  const completedChecklists = checklistInstances.filter((c) => c.items.length > 0 && c.items.every((i) => i.isDone));
  const checklistRow = (c: (typeof checklistInstances)[number]): DrilldownRow => {
    const total = c.items.length;
    const done = c.items.filter((i) => i.isDone).length;
    const completed = total > 0 && done === total;
    return {
      id: c.id,
      title: c.title,
      link: `/checklists/${c.id}`,
      createdAt: c.generatedAt,
      completed,
      overdue: isInstanceOverdue(c, completed),
    };
  };

  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  const { chartData, current, previous, projection, completionRows, onTimeRows, qualityRows } = useMemo(() => {
    const now = new Date().getTime();
    const nowDate = new Date(now);
    const isOverdueTask = (t: Task) => t.status !== 'done' && !!t.dueDate && new Date(t.dueDate).getTime() < now;

    const items: WorkItem[] = [
      ...tasks.map((t) => ({
        createdAt: t.createdAt,
        completed: t.status === 'done',
        overdue: isOverdueTask(t),
        verified: t.verifiedBy != null,
      })),
      ...tickets.map((t) => ({
        createdAt: t.createdAt,
        completed: t.status === 'CLOSED',
        overdue: t.isOverdue,
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
    }));

    const currentRates = bucketRates[bucketRates.length - 1];
    const previousRates = bucketRates[bucketRates.length - 2] ?? rateFor([]);

    const currentStart = buckets[buckets.length - 1].start;
    const currentEnd = buckets[buckets.length - 1].end;

    const elapsedFraction = Math.min(1, Math.max(0.02, (now - currentStart.getTime()) / (currentEnd.getTime() - currentStart.getTime())));
    const projectedCompleted =
      currentRates.total > 0 && elapsedFraction < 0.98 ? Math.round(currentRates.completedCount / elapsedFraction) : null;

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
    const completionRows = byNewest([
      ...currentTasks.filter((t) => t.status === 'done').map(taskRow),
      ...currentTickets.filter((t) => t.status === 'CLOSED').map(ticketRow),
    ]);
    const onTimeRows = byNewest([
      ...currentTasks.filter((t) => !isOverdueTask(t)).map(taskRow),
      ...currentTickets.filter((t) => !t.isOverdue).map(ticketRow),
    ]);
    // Denominator is completed items, not all items — "how much of what's done actually passed
    // review", matching how `rateFor`'s own `quality` is scoped.
    const doneTasks = currentTasks.filter((t) => t.status === 'done');
    const closedTickets = currentTickets.filter((t) => t.status === 'CLOSED');
    const qualityRows = byNewest([
      ...doneTasks.filter((t) => t.verifiedBy != null).map(taskRow),
      ...closedTickets.filter((t) => t.verifiedBy != null).map(ticketRow),
    ]);

    return { chartData: data, current: currentRates, previous: previousRates, projection: projectedCompleted, completionRows, onTimeRows, qualityRows };
  }, [tasks, tickets, period]);

  const hasData = chartData.some((d) => d.completion != null || d.onTime != null);

  return (
    // `p-4 sm:p-6 lg:p-7` matches MonthlyTargetCard, which shares this card's row — the two had
    // different inner padding from `lg` up, which read as a misalignment between the pair.
    // `flex flex-col gap-4` replaces the five `mb-*`/`mt-*` offsets its children each carried —
    // one owner for the vertical rhythm instead of every block declaring its own.
    <section aria-labelledby="compare-dashboard-heading" className={`@container flex flex-col gap-4 ${DASHBOARD_CARD_CLASS} p-4 sm:p-6 lg:p-7`}>
      {/* `@sm:flex-row`, not `sm:flex-row` — this card sits in a 2-up grid from the viewport's own
          `sm` up, so at exactly that crossover the card is already halved (narrower than a full-
          width mobile card), and a viewport-based breakpoint switched to a row layout before the
          card actually had the width for it: the title/subtitle wrapped to two lines fighting the
          period tabs for space, and the tabs themselves got squeezed enough to silently overflow
          past the card (the app shell clips horizontal overflow with no scrollbar, so "Month" and
          "Year" just vanished with no visible sign why). Keying off the card's own measured width
          instead keeps this row stacked until it actually fits. */}
      <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <EntityIconTile icon={TrendingUp} />
          <div>
            <h2 id="compare-dashboard-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">Compare Dashboard</h2>
            {/* The chips below are a snapshot of the CURRENT bucket vs. the one before it, not an
                average across the whole trend line — spelling that out here is what stops
                "Completion" from reading as the same number as the gauges or Delegation Score,
                which are scoped to different windows entirely. */}
            <p className="hidden sm:block text-xs font-medium text-text-muted mt-0.5 capitalize">this {period} vs. last</p>
          </div>
        </div>

        <PeriodTabControl value={period} options={COMPLIANCE_PERIOD_OPTIONS} labels={PERIOD_TAB_LABEL} onChange={onPeriodChange} />
      </div>

      {/* "On-time" used index.css's `coral` accent before — its own doc comment scopes coral to
          decorative use (OrbitDecoration, dashboard blobs), and its gold hue reads too close to
          `warning` for a metric that's actually good news. `info` also matches the
          primary/info pairing ActivityTrendChart already uses for its two data series. */}
      <div className="grid grid-cols-2 @sm:grid-cols-4 gap-2">
        <SummaryChip
          label="Completion"
          value={current.completion}
          previous={previous.completion}
          dotClassName="bg-primary-500"
          count={current.completedCount}
          total={current.total}
          onClick={() => setDrilldown({ title: `Completed this ${period}`, icon: CheckCircle2, rows: completionRows })}
        />
        <SummaryChip
          label="On-time"
          value={current.onTime}
          previous={previous.onTime}
          dotClassName="bg-info"
          count={current.onTimeCount}
          total={current.total}
          onClick={() => setDrilldown({ title: `On-time this ${period}`, icon: Clock, rows: onTimeRows })}
        />
        <SummaryChip
          label="Quality Rate"
          value={current.quality}
          previous={previous.quality}
          dotClassName="bg-warning"
          count={current.qualityCount}
          total={current.completedCount}
          onClick={() => setDrilldown({ title: `Quality-verified this ${period}`, icon: ShieldCheck, rows: qualityRows })}
        />
        <SummaryChip
          label="Checklist"
          value={checklistCompliance}
          previous={null}
          dotClassName="bg-success"
          count={checklistDoneItems}
          total={checklistTotalItems}
          onClick={() => setDrilldown({
            title: 'Completed checklists',
            icon: ListChecks,
            rows: byNewest(completedChecklists.map(checklistRow)),
            viewAllHref: '/checklists?status=completed',
            viewAllLabel: 'View all in Checklist',
          })}
        />
      </div>

      {/* Trend line is desktop-only — the four chips above already carry the actionable numbers
          (each opens its own drilldown), so on a phone the chart was extra height behind a toggle. */}
      <div className="hidden sm:contents">
      {/* The two series' colours had no key anywhere. The chips above look like one — they carry
          matching dots — but the third chip (Checklist, green) isn't plotted at all, so reading
          them as a legend actively misleads. An explicit two-item key next to the chart is the
          only thing that says which line is which. */}
      <div className="flex items-center gap-4">
        {[
          { label: 'Completion', className: 'bg-primary-500' },
          { label: 'On-time', className: 'bg-info' },
        ].map((series) => (
          <div key={series.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-full shrink-0 ${series.className}`} />
            <span className="text-[11px] font-display font-medium text-text-muted">{series.label}</span>
          </div>
        ))}
      </div>

      {hasData ? (
        <div ref={setChartBoxEl} className="w-full" style={{ height: COMPARE_CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`compFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary-500)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-primary-500)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`onTimeFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-info)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-info)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                // interval={0} forces every bucket's label onto the axis — fine once the chart has
                // room for them, but "week" (8 buckets of "15 Aug"-style labels) on a narrow render
                // just overlaps into an unreadable smear. Thinning to roughly one label per 50px of
                // this chart's own measured width keeps every period readable at whatever width it
                // actually renders at — a 2-up grid card at a "desktop" viewport can be narrower
                // than a full-width card at a "mobile" one, so a viewport-based check isn't enough.
                interval={
                  chartBoxWidth > 0 && chartData.length > Math.max(2, Math.floor(chartBoxWidth / 50))
                    ? Math.ceil(chartData.length / Math.max(2, Math.floor(chartBoxWidth / 50))) - 1
                    : 0
                }
                padding={{ left: 16, right: 16 }}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500 }}
                dy={10}
              />

              {/* Both series are percentages, but with no domain Recharts auto-scaled to the data's
                  own range — two series sitting between 90% and 100% got stretched into a dramatic
                  mountain range, making a 4-point difference look like a collapse. Pinning 0-100
                  is the honest scale for a percentage, and the axis labels (previously absent
                  entirely, so no value was readable without hovering) now say what the height
                  means. Hidden on a narrow render, where the gutter costs more than the reading is
                  worth — measured the same way as the XAxis thinning above, not by viewport. */}
              {chartBoxWidth === 0 || chartBoxWidth >= 300 ? (
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={34}
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(value: number) => `${value}%`}
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }}
                />
              ) : (
                // Still needs the domain even with the axis hidden, or the plot rescales to the
                // data range the moment the labels disappear.
                <YAxis hide domain={[0, 100]} />
              )}

              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" strokeOpacity={0.4} />

              <Tooltip cursor={{ stroke: 'var(--color-border-hover)' }} content={<ChartTooltip />} />
              {/* A 0-radius dot draws nothing on a point with no non-null neighbor to connect a
                  line to — with only a bucket or two of real data (the common case for a fresh
                  week/month), that point had no line AND no dot, i.e. rendered as nothing at all.
                  A small persistent dot keeps sparse/isolated points visible. */}
              {/* Same soft color-matched glow ReportTrendChart's lines use — one shared "how a
                  trend line looks" language across every area chart on the dashboard. */}
              <Area
                type="monotone"
                dataKey="completion"
                stroke="var(--color-primary-500)"
                strokeWidth={2.5}
                style={{ filter: 'drop-shadow(0 2px 3px color-mix(in srgb, var(--color-primary-500) 35%, transparent))' }}
                fill={`url(#compFill-${gradientId})`}
                connectNulls
                dot={{ r: 3, strokeWidth: 0, fill: 'var(--color-primary-500)' }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-surface)' }}
              />
              <Area
                type="monotone"
                dataKey="onTime"
                stroke="var(--color-info)"
                strokeWidth={2.5}
                style={{ filter: 'drop-shadow(0 2px 3px color-mix(in srgb, var(--color-info) 35%, transparent))' }}
                fill={`url(#onTimeFill-${gradientId})`}
                connectNulls
                dot={{ r: 3, strokeWidth: 0, fill: 'var(--color-info)' }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-surface)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        // The reserved height still matches the loaded chart's own — removing that would just
        // trade "empty and static" for "the card resizes under you once data arrives". What
        // changed is the inside: was a bare icon + one idle line floating in the box with nothing
        // to do; now it's a real way out of the empty state, not just a description of it.
        <div
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-hover bg-primary-500/[0.03] gap-3 px-5 animate-in fade-in duration-500"
          style={{ height: COMPARE_CHART_HEIGHT }}
        >
          <div className="flex items-center justify-center size-11 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm shadow-primary-900/20">
            <TrendingUp size={19} />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-sm font-display font-bold text-text text-center">Nothing to compare yet</p>
            <p className="text-xs font-medium text-text-muted text-center max-w-[26rem]">This fills in once your team logs its first delegation or ticket.</p>
          </div>
          <Button size="sm" className="rounded-full mt-1" onClick={() => navigate('/tasks?create=1')}>
            <Plus size={13} strokeWidth={2.75} />
            New delegation
          </Button>
        </div>
      )}
      </div>

      {projection != null && (
        <div className="hidden sm:flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-primary-500/5 border border-primary-500/10 text-xs font-display font-medium text-text-secondary">
          <Sparkles size={14} className="text-primary-500 shrink-0" />
          <span>
            At this pace, you're on track for <span className="font-bold text-text">~{projection}</span> completed by {PERIOD_END_LABEL[period]}.
          </span>
        </div>
      )}

      {/* Same "tap a stat, see the exact records" modal as the KPI strip and Team's progress card
          above it on this page — one interaction language for every stat on the Dashboard instead
          of this card being the one that only ever showed a pair of aggregate counts. */}
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
