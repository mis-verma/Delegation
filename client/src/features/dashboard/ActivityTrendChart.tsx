import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { BarChart3, CheckSquare, ChevronRight, ClipboardCheck, ListTodo, Plus, TicketCheck, type LucideIcon } from 'lucide-react';
import { useIsMobile } from '../../lib/useMediaQuery';
import { PinnedBreakdown } from './PinnedBreakdown';
import { createdRangeHref } from '../../lib/createdRange';
import { EmptyState } from '../../components';
import {
  lastActivityBuckets,
  countItemsInRange,
  ACTIVITY_BUCKET_COUNT,
  ACTIVITY_GROUP_RANGE_LABEL,
  ACTIVITY_CATEGORY_ORDER,
  ACTIVITY_CATEGORY_LABEL,
  ACTIVITY_CATEGORY_COLOR,
  type ActivityGroupBy,
  type ActivityCategory,
  type ActivityWorkItem,
} from './dashboardDisplay';

interface ActivityTrendChartProps {
  items: ActivityWorkItem[];
  activeCategories: ReadonlySet<ActivityCategory>;
  groupBy: ActivityGroupBy;
  /** Phones have no filter chips above the card, so the chart carries its own category picker. */
  onToggleCategory?: (category: ActivityCategory) => void;
}

type ActivityDatum = { label: string; track?: number } & Record<ActivityCategory, number>;

// Widest a bar may grow. Fewer buckets (month, quarter, year) get wider bars up to this.
const BAR_WIDTH = 48;
// One corner radius for the bars and the track behind them, so the two always match.
const BAR_RADIUS = 6;

/**
 * The chart, both of its empty states, and HomePage's loading skeleton must all be exactly this
 * tall or the card visibly resizes as data arrives. It was written as a bare `h-[240px]` in four
 * separate places before, with nothing keeping them equal.
 */
export const ACTIVITY_CHART_HEIGHT = 240;

interface NarrowCursorProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

// Soft highlight behind the hovered bar. It fills that bar's whole slot, so it follows the bar width
// at every zoom (day, month, quarter, year) instead of a fixed 44px.
const NarrowCursor = ({ x = 0, y = 0, width = 0, height = 0 }: NarrowCursorProps) => (
  <rect
    x={x + 2}
    y={y - 6}
    width={Math.max(0, width - 4)}
    height={height + 12}
    rx={8}
    fill="var(--color-primary-500)"
    fillOpacity={0.06}
  />
);

interface SegmentShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  fillOpacity?: number | string;
  payload?: ActivityDatum;
}

// Draws one stack segment. Only the segment that is actually on top of that day's bar gets rounded
// corners: Recharts rounds per series, so on a day where the last category is 0 the visible top was
// square. Empty segments draw nothing, which also removes the thin outline line they used to leave.
const makeSegmentShape = (category: ActivityCategory, activeOrder: readonly ActivityCategory[]) =>
  function SegmentShape({ x = 0, y = 0, width = 0, height = 0, fill, fillOpacity, payload }: SegmentShapeProps) {
    if (!payload || height <= 0 || width <= 0) return null;
    const at = activeOrder.indexOf(category);
    const isTop = activeOrder.slice(at + 1).every((c) => payload[c] === 0);
    // The lowest drawn segment is rounded at the bottom too, so a bar sits on the baseline with the
    // same corners as the soft track behind it instead of square feet under round tops.
    const isBottom = activeOrder.slice(0, at).every((c) => payload[c] === 0);
    const r = Math.min(BAR_RADIUS, width / 2, height / 2);
    const rt = isTop ? r : 0;
    const rb = isBottom ? r : 0;
    const bottom = y + height;
    const right = x + width;
    const d = `M${x + rt},${y} H${right - rt} Q${right},${y} ${right},${y + rt} V${bottom - rb} Q${right},${bottom} ${right - rb},${bottom} H${x + rb} Q${x},${bottom} ${x},${bottom - rb} V${y + rt} Q${x},${y} ${x + rt},${y} Z`;
    return (
      <path
        d={d}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke="var(--color-surface)"
        strokeWidth={1.5}
        className="transition-[fill-opacity] duration-300"
      />
    );
  };

// Where each category's list lives; a click on a bar opens it narrowed to that bar's period.
const CATEGORY_PAGE: Record<ActivityCategory, string> = {
  delegation: '/tasks',
  ticket: '/tickets',
  checklist: '/checklists',
  todo: '/todo',
};

const CATEGORY_ICON: Record<ActivityCategory, LucideIcon> = {
  delegation: CheckSquare,
  ticket: TicketCheck,
  checklist: ClipboardCheck,
  todo: ListTodo,
};

// Phone category picker: one big tappable tile per category (44px high), in the category's own
// colour, showing its count while on. It is the chart's legend and its filter in one, so switching
// between Checklist, Ticket, Delegation and To-Do is a single tap.
const MobileCategoryPicker = memo(({
  active,
  totals,
  onToggle,
}: {
  active: ReadonlySet<ActivityCategory>;
  totals: Record<ActivityCategory, number> | null;
  onToggle?: (category: ActivityCategory) => void;
}) => (
  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choose what the chart shows">
    {ACTIVITY_CATEGORY_ORDER.map((category) => {
      const on = active.has(category);
      const Icon = CATEGORY_ICON[category];
      return (
        <button
          key={category}
          type="button"
          onClick={() => onToggle?.(category)}
          aria-pressed={on}
          className={`flex items-center gap-2.5 min-h-11 px-2.5 rounded-xl border text-left outline-none transition-colors duration-150 cursor-pointer active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
            on ? 'border-border bg-surface' : 'border-border/50 bg-surface-hover/40 opacity-60'
          }`}
        >
          <span
            aria-hidden="true"
            className="flex items-center justify-center size-7 shrink-0 rounded-lg text-white"
            style={{ backgroundColor: on ? ACTIVITY_CATEGORY_COLOR[category] : 'var(--color-text-light)' }}
          >
            <Icon size={15} />
          </span>
          <span className="flex flex-col min-w-0 leading-tight">
            <span className="text-xs font-display font-semibold text-text truncate">{ACTIVITY_CATEGORY_LABEL[category]}</span>
            <span className="text-xs font-medium text-text-muted tabular-nums">{on ? (totals ? totals[category] : '') : 'Off'}</span>
          </span>
        </button>
      );
    })}
  </div>
));
MobileCategoryPicker.displayName = 'MobileCategoryPicker';

const datumTotal = (datum: ActivityDatum, order: readonly ActivityCategory[]) =>
  order.reduce((sum, c) => sum + datum[c], 0);

// Shared by the hover tooltip and the tap-to-pin panel below the chart, so mobile (no hover) gets
// the exact same breakdown a desktop user sees on hover, not a stripped-down version. Only shows
// rows for categories the filter above the chart currently has active.
//
// `onCategoryClick` is only ever passed by the tap-to-pin panel, never the hover tooltip — a
// hover tooltip disappears the instant the pointer moves toward it, so nothing inside one can be
// clickable in practice.
const BreakdownRows = memo(({
  datum,
  activeCategories,
  onCategoryClick,
  compact = false,
}: {
  datum: ActivityDatum;
  activeCategories: ReadonlySet<ActivityCategory>;
  onCategoryClick?: (category: ActivityCategory) => void;
  /** Hover card: tighter rows, and only the categories that have something on that day. */
  compact?: boolean;
}) => (
  <div className={compact ? 'flex flex-col gap-0.5' : 'flex flex-col gap-1.5'}>
    {ACTIVITY_CATEGORY_ORDER.filter((category) => activeCategories.has(category) && (!compact || datum[category] > 0)).map((category) => {
      const clickable = !!onCategoryClick && datum[category] > 0;
      const RowTag = clickable ? 'button' : 'div';
      return (
        // min-h-11 (44px): this row is a button in the pinned panel and needs the touch floor.
        <RowTag
          key={category}
          type={clickable ? 'button' : undefined}
          onClick={clickable ? () => onCategoryClick!(category) : undefined}
          className={`flex items-center justify-between gap-4 text-sm w-full ${compact ? 'min-h-8' : 'min-h-11'} rounded-lg -mx-2 px-2 transition-colors duration-200 ${
            clickable ? 'cursor-pointer text-left hover:bg-surface-hover' : ''
          }`}
        >
          <div className="flex items-center gap-1.5 text-text-secondary">
            <span aria-hidden="true" className="size-2 rounded-full shrink-0" style={{ backgroundColor: ACTIVITY_CATEGORY_COLOR[category] }} />
            {ACTIVITY_CATEGORY_LABEL[category]}
          </div>
          <span className="flex items-center gap-2.5 shrink-0">
            <span className="font-display font-bold text-text tabular-nums">{datum[category]}</span>
            {clickable && <ChevronRight size={14} strokeWidth={2.5} className="text-text-light" aria-hidden="true" />}
          </span>
        </RowTag>
      );
    })}
  </div>
));
BreakdownRows.displayName = 'BreakdownRows';

// Phone version of the tap-to-pin breakdown: one fixed row of equal cells — the day and its total,
// then one per non-zero category (count over label) — instead of a titled panel of 44px rows. Equal
// grid columns mean it never wraps, however many categories there are. Closes on a tap outside
// the chart or on the same bar again (see ActivityTrendChart).
const CompactBreakdown = memo(({
  datum,
  activeCategories,
  onCategoryClick,
}: {
  datum: ActivityDatum;
  activeCategories: ReadonlySet<ActivityCategory>;
  onCategoryClick: (category: ActivityCategory) => void;
}) => {
  const shown = ACTIVITY_CATEGORY_ORDER.filter((c) => activeCategories.has(c) && datum[c] > 0);
  const total = datumTotal(datum, shown);
  return (
    <div
      role="status"
      className="grid gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ gridTemplateColumns: `repeat(${shown.length + 1}, minmax(0, 1fr))` }}
    >
      <div className="flex flex-col items-center justify-center gap-0.5 min-h-12 px-1 rounded-xl bg-primary-700 text-white">
        <span className="text-sm font-display font-bold tabular-nums leading-none">{total}</span>
        <span className="text-xs font-medium text-white/75 leading-none">{datum.label}</span>
      </div>
      {shown.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onCategoryClick(category)}
          aria-label={`${ACTIVITY_CATEGORY_LABEL[category]}: ${datum[category]}. Tap for the items.`}
          className="flex flex-col items-center justify-center gap-0.5 min-h-12 px-1 rounded-xl border border-border/60 bg-surface active:bg-surface-hover transition-colors duration-150 cursor-pointer"
        >
          {/* Dot beside the number, not the label — the label needs the cell's full width to fit
              "Delegation" at 360px. */}
          <span className="flex items-center gap-1 text-sm font-display font-bold text-text tabular-nums leading-none">
            <span aria-hidden="true" className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: ACTIVITY_CATEGORY_COLOR[category] }} />
            {datum[category]}
          </span>
          <span className="max-w-full truncate text-xs font-medium text-text-muted leading-none">{ACTIVITY_CATEGORY_LABEL[category]}</span>
        </button>
      ))}
    </div>
  );
});
CompactBreakdown.displayName = 'CompactBreakdown';

export const ActivityTrendChart = ({ items, activeCategories, groupBy, onToggleCategory }: ActivityTrendChartProps) => {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  // Desktop hover card. It is our own element (not Recharts' tooltip) so its rows can be clicked: it
  // hides 250ms after the pointer leaves the bar, which gives the pointer time to cross the small gap
  // and land on the card, and entering the card cancels the hide.
  const [hover, setHover] = useState<{ index: number; x: number; width: number } | null>(null);
  const hideTimer = useRef<number | null>(null);
  const cancelHide = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setHover(null), 250);
  };
  useEffect(() => () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
  }, []);

  // Phones: a tap anywhere outside the chart dismisses the pinned breakdown straight away, instead
  // of it staying up until the same bar is tapped again. Skipped while the drill-down modal is open
  // — it renders in a portal outside rootRef and needs `selectedIndex` to stay set.
  useEffect(() => {
    if (!isMobile || selectedIndex === null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isMobile, selectedIndex]);

  // Bucket indices mean something different per granularity (e.g. index 3 of 7 days vs. index 3
  // of 4 quarters) — clear any pinned selection rather than let it silently point at the wrong
  // bar. Resetting during render (the React-recommended way to reset state on a prop change)
  // instead of an effect avoids an extra cascading render.
  const [prevGroupBy, setPrevGroupBy] = useState(groupBy);
  if (groupBy !== prevGroupBy) {
    setPrevGroupBy(groupBy);
    setSelectedIndex(null);
    setHover(null);
  }

  const activeOrder = useMemo(() => ACTIVITY_CATEGORY_ORDER.filter((c) => activeCategories.has(c)), [activeCategories]);
  const segmentShapes = useMemo(() => {
    const shapes = {} as Record<ActivityCategory, ReturnType<typeof makeSegmentShape>>;
    for (const category of ACTIVITY_CATEGORY_ORDER) shapes[category] = makeSegmentShape(category, activeOrder);
    return shapes;
  }, [activeOrder]);

  // Kept alongside `data` (same index) purely so a clicked breakdown row can look its bucket's
  // [start, end) back up — the bar itself only ever needed the count, not the range that produced
  // it, until drill-down needed to re-filter `items` for the exact same window.
  const buckets = useMemo(() => lastActivityBuckets(groupBy, ACTIVITY_BUCKET_COUNT[groupBy]), [groupBy]);

  const data = useMemo<ActivityDatum[]>(() => {
    return buckets.map((b) => {
      const counts = {} as Record<ActivityCategory, number>;
      for (const category of ACTIVITY_CATEGORY_ORDER) {
        counts[category] = activeCategories.has(category) ? countItemsInRange(items, category, b.start, b.end) : 0;
      }
      return { label: b.label, ...counts };
    });
  }, [items, activeCategories, buckets]);

  const hasData = data.some((d) => ACTIVITY_CATEGORY_ORDER.some((category) => d[category] > 0));
  // Every bucket gets a soft full-height track (the tallest bar's height) drawn behind its bar,
  // empty days included, so a short day reads against the period's scale instead of as a sliver.
  const chartData = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => datumTotal(d, ACTIVITY_CATEGORY_ORDER)));
    return data.map((d) => ({ ...d, track: max }));
  }, [data]);
  const categoryTotals = useMemo(() => {
    const totals = {} as Record<ActivityCategory, number>;
    for (const category of ACTIVITY_CATEGORY_ORDER) totals[category] = data.reduce((sum, d) => sum + d[category], 0);
    return totals;
  }, [data]);
  const windowTotal = activeOrder.reduce((sum, c) => sum + categoryTotals[c], 0);

  // Text alternative for the picture: the headline total and the busiest bucket.
  const rangeText = ACTIVITY_GROUP_RANGE_LABEL[groupBy];
  const peak = useMemo(() => {
    let best = { label: '', total: 0 };
    for (const d of data) {
      const total = datumTotal(d, activeOrder);
      if (total > best.total) best = { label: d.label, total };
    }
    return best;
  }, [data, activeOrder]);
  const chartSummary = `Bar chart of items created in the ${rangeText}: ${windowTotal} ${windowTotal === 1 ? 'item' : 'items'}${
    peak.total > 0 ? `, peak ${peak.label} ${peak.total}` : ''
  }.`;

  if (activeOrder.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {isMobile && <MobileCategoryPicker active={activeCategories} totals={null} onToggle={onToggleCategory} />}
        <div className="flex flex-col [&>*]:h-full" style={{ height: ACTIVITY_CHART_HEIGHT }}>
          <EmptyState icon={BarChart3} size="compact" title="No categories selected" description="Pick at least one category to see the trend." />
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex flex-col gap-3">
        {isMobile && <MobileCategoryPicker active={activeCategories} totals={categoryTotals} onToggle={onToggleCategory} />}
        <div className="flex flex-col [&>*]:h-full [&>*]:py-6" style={{ height: ACTIVITY_CHART_HEIGHT }}>
          <EmptyState
            icon={BarChart3}
            title="No items created in this period yet"
            action={{ label: 'New delegation', icon: Plus, onClick: () => navigate('/tasks?create=1', { viewTransition: true }) }}
          />
        </div>
      </div>
    );
  }

  // Phones get an explicit bar width — left to barCategoryGap alone, bars rendered as thin slivers
  // on a narrow card. ~70% of each bucket's share of a ~300px plot, capped at 30px, so a 12-bucket
  // view still leaves a gap between bars instead of running them together.
  // Desktop gets a fixed, chunky width too; left to Recharts it drew ~12px sticks.
  const mobileBarSize = isMobile ? Math.min(28, Math.floor((300 / data.length) * 0.66)) : undefined;

  // Whole-number ticks only (these are item counts), and no more ticks than the tallest bar has
  // steps. Asking for the default five with `allowDecimals={false}` made a quiet week whose tallest
  // bar is 2 get an axis running 0-4, so every bar and its gray track stopped halfway up the plot.
  const yMax = chartData[0]?.track ?? 1;
  const yTickCount = yMax < 4 ? yMax + 1 : 5;

  const selectedDatum = selectedIndex !== null ? data[selectedIndex] : null;
  // Switching Day / Month / Quarter / Year changes how many bars there are, so a hover index from the
  // old view can point past the end. Read it through this guard, never data[hover.index] directly.
  const hoverDatum = hover ? data[hover.index] : undefined;
  // The card sits half a bar slot (plus a small gap) away from the bar's centre.
  const hoverGap = hover && data.length ? hover.width / data.length / 2 + 6 : 12;
  // Bars read at full, real color until the user actually taps one to isolate it — no ambient
  // dimming of "not today" bars, which used to make legitimate data look washed-out for no reason.
  const cellOpacity = (i: number) => (selectedIndex === null || i === selectedIndex ? 1 : 0.25);

  // Desktop: one click on a coloured part of a bar, or on a row in the hover card, opens that
  // category's items for that period straight away (the list pop-up, with a View all button).
  const openCategory = (category: ActivityCategory, index: number) => {
    cancelHide();
    setHover(null);
    navigate(createdRangeHref(CATEGORY_PAGE[category], buckets[index].start, buckets[index].end), { viewTransition: true });
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-3 sm:gap-4 w-full">
      {/* Phones: the headline first (how much was created in this window), then one cell per
          category with its colour, count and name, which doubles as the chart's legend. Desktop
          has the category filter chips above the chart for that. */}
      {isMobile && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-display font-bold text-text tabular-nums leading-none">{windowTotal}</span>
            <span className="text-xs font-medium text-text-muted">items created in the {rangeText}</span>
          </div>
          <MobileCategoryPicker active={activeCategories} totals={categoryTotals} onToggle={onToggleCategory} />
        </div>
      )}

      {/* The picture is one labelled image for assistive tech. Recharts' built-in accessibility
          layer stays off: it wraps the chart in its own focusable <div tabIndex={0}> that the
          browser outlines on click, and a focusable child inside role="img" is not announced
          anyway. The sr-only table and buttons below are the keyboard and screen-reader route. */}
      <div ref={plotRef} className="relative w-full">
      <div role="img" aria-label={chartSummary} className="w-full [&_.recharts-bar-rectangle]:cursor-pointer" style={{ height: ACTIVITY_CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            accessibilityLayer={false}
            // The right/left gutters stay at 0 — the axis below reserves its own width when it's
            // shown, and an extra `left` offset shifts the plot area far enough on a narrow mobile
            // card to clip the first bar against the edge. `top` leaves room for the total-count
            // label sitting just above the tallest bar.
            margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
            barCategoryGap="32%"
            onClick={(state) => {
              // Phones only: a tap pins that bar's small card over the chart. Desktop opens things
              // by clicking a coloured part of a bar (see openCategory), so nothing is pinned.
              if (!isMobile) return;
              // Recharts 3 reports this as a string ("3"), not a number — the old
              // `typeof === 'number'` check never passed, so tapping a bar pinned nothing.
              const raw = state?.activeTooltipIndex;
              const index = raw == null ? NaN : Number(raw);
              if (Number.isInteger(index)) setSelectedIndex((prev) => (prev === index ? null : index));
            }}
            onMouseMove={(state) => {
              if (isMobile) return;
              const raw = state?.activeTooltipIndex;
              const index = raw == null ? NaN : Number(raw);
              const x = state?.activeCoordinate?.x;
              if (!Number.isInteger(index) || x == null) return;
              cancelHide();
              setHover((prev) => (prev && prev.index === index ? prev : { index, x, width: plotRef.current?.clientWidth ?? 0 }));
            }}
            onMouseLeave={() => { if (!isMobile) scheduleHide(); }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
            />

            {/* Each category bar fills with a two-stop vertical gradient of its own flat token
                color: a lighter highlight along the top of each segment fading into its real tone. */}
            <defs>
              {ACTIVITY_CATEGORY_ORDER.map((category) => (
                <linearGradient key={category} id={`activity-bar-${category}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACTIVITY_CATEGORY_COLOR[category]} stopOpacity={0.88} />
                  <stop offset="100%" stopColor={ACTIVITY_CATEGORY_COLOR[category]} stopOpacity={1} />
                </linearGradient>
              ))}
            </defs>

            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }}
              dy={12}
            />

            {/* Value axis hidden on mobile, where the gutter costs more plot width than the reading
                is worth (the tap-to-pin panel below covers that case), and integer-only because
                these are item counts. */}
            {!isMobile && (
              <YAxis
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
                tickCount={yTickCount}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }}
              />
            )}

            {/* Stays mounted on phones but renders nothing there — the chart's onClick reads
                `activeTooltipIndex`, which Recharts only tracks while a Tooltip exists. */}
            <Tooltip
              cursor={isMobile ? false : <NarrowCursor />}
              content={() => null}
              isAnimationActive={false} // Prevents jitter on fast hovering
            />

            {/* Stacked bars — one per active category, in a fixed order, so the stack doesn't
                reshuffle as categories are toggled. A surface-colored stroke outlines every segment
                so adjacent navy tones stay distinguishable. */}
            <XAxis xAxisId="track" dataKey="label" hide />
            <Bar
              xAxisId="track"
              dataKey="track"
              fill="var(--color-surface-hover)"
              radius={BAR_RADIUS}
              maxBarSize={BAR_WIDTH}
              barSize={mobileBarSize}
              isAnimationActive={false}
              activeBar={false}
            />

            {activeOrder.map((category) => {
              return (
                <Bar
                  key={category}
                  dataKey={category}
                  stackId="stack"
                  shape={segmentShapes[category]}
                  maxBarSize={BAR_WIDTH}
                  barSize={mobileBarSize}
                  onClick={isMobile ? undefined : (_, index) => openCategory(category, index)}
                >
                  {data.map((d, i) => (
                    <Cell key={d.label} fill={`url(#activity-bar-${category})`} fillOpacity={cellOpacity(i)} className="transition-[fill-opacity] duration-300" />
                  ))}
                </Bar>
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Desktop hover card: the same breakdown, with every row clickable. Flips to the left of the
          bar on the right half of the chart so it never runs off the card. */}
      {!isMobile && hover && hoverDatum && datumTotal(hoverDatum, activeOrder) > 0 && (
        <div
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          className="absolute top-2 z-20"
          style={
            hover.x < hover.width * 0.55
              ? { left: hover.x + hoverGap }
              : { right: hover.width - hover.x + hoverGap }
          }
        >
          <PinnedBreakdown title={hoverDatum.label} variant="tooltip" className="min-w-[160px] !gap-1.5">
            <BreakdownRows compact datum={hoverDatum} activeCategories={activeCategories} onCategoryClick={(category) => openCategory(category, hover.index)} />
          </PinnedBreakdown>
        </div>
      )}

      {/* Phones: a tap on a bar floats its small card over the top of the chart, so nothing on the
          page is pushed down. Rows open the category straight away; a tap outside closes it. */}
      {isMobile && selectedDatum && (
        <div className="absolute inset-x-0 top-0 z-20 rounded-2xl border border-border bg-surface p-1.5">
          <CompactBreakdown datum={selectedDatum} activeCategories={activeCategories} onCategoryClick={(category) => openCategory(category, selectedIndex ?? 0)} />
        </div>
      )}
      </div>

      {/* The same numbers as a plain table for screen readers. */}
      <table className="sr-only">
        <caption>Items created in the {rangeText}, by period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {activeOrder.map((category) => (
              <th key={category} scope="col">{ACTIVITY_CATEGORY_LABEL[category]}</th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              {activeOrder.map((category) => (
                <td key={category}>{d[category]}</td>
              ))}
              <td>{datumTotal(d, activeOrder)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Keyboard-accessible proxy for the same pin interaction the mouse gets via the chart's
          onClick. Hidden until focused so it doesn't visually duplicate the x-axis labels. */}
      <div className="flex flex-wrap gap-1">
        {data.map((d, i) => {
          const total = datumTotal(d, activeOrder);
          return (
            <button
              key={d.label}
              type="button"
              onClick={() => setSelectedIndex((prev) => (prev === i ? null : i))}
              aria-pressed={selectedIndex === i}
              className="sr-only focus:not-sr-only focus:relative focus:z-10 focus:px-2.5 focus:py-1 focus:rounded-md focus:border focus:border-border focus:bg-surface focus:text-xs focus:font-medium focus:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none"
            >
              {d.label}: {total} {total === 1 ? 'item' : 'items'}
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs font-medium text-text-muted">
        {isMobile ? 'Tap a bar, then pick a category to open it' : 'Click a coloured part of a bar to open that day on its page'}
      </p>
    </div>
  );
};
