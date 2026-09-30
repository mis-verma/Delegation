import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { BarChart3, ChevronRight, Plus } from 'lucide-react';
import { useIsMobile } from '../../lib/useMediaQuery';
import { PinnedBreakdown, BreakdownHint } from './PinnedBreakdown';
import { DrilldownModal } from './DrilldownModal';
import { Button } from '../../components';
import {
  lastActivityBuckets,
  countItemsInRange,
  itemsInRange,
  ACTIVITY_BUCKET_COUNT,
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
}

type ActivityDatum = { label: string; track?: number } & Record<ActivityCategory, number>;

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: ActivityDatum }[];
  activeCategories: ReadonlySet<ActivityCategory>;
}

const BAR_WIDTH = 44;

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

// Upgraded Cursor: Uses a subtle, soft-edged highlight rather than a harsh block
const NarrowCursor = ({ x = 0, y = 0, width = 0, height = 0 }: NarrowCursorProps) => (
  <rect
    x={x + width / 2 - BAR_WIDTH / 2 - 4}
    y={y - 10}
    width={BAR_WIDTH + 8}
    height={height + 20}
    rx={8}
    fill="var(--color-primary-500)"
    fillOpacity={0.06}
  />
);

// Shared by the hover tooltip and the tap-to-pin panel below the chart, so mobile (no hover) gets
// the exact same breakdown a desktop user sees on hover, not a stripped-down version. Only shows
// rows for categories the filter above the chart currently has active.
//
// `onCategoryClick` is only ever passed by the tap-to-pin panel, never the hover tooltip — a
// hover tooltip disappears the instant the pointer moves toward it, so nothing inside one can be
// clickable in practice.
const BreakdownRows = ({
  datum,
  activeCategories,
  onCategoryClick,
}: {
  datum: ActivityDatum;
  activeCategories: ReadonlySet<ActivityCategory>;
  onCategoryClick?: (category: ActivityCategory) => void;
}) => (
  <>
    <div className="flex flex-col gap-1.5">
      {ACTIVITY_CATEGORY_ORDER.filter((category) => activeCategories.has(category)).map((category) => {
        const clickable = !!onCategoryClick && datum[category] > 0;
        const RowTag = clickable ? 'button' : 'div';
        return (
          // min-h-11 (44px) — same tap-target fix as ActivityComplianceGauges' BreakdownRatioRows;
          // this row became a button when the drill-down modal was added and needs the same floor.
          <RowTag
            key={category}
            type={clickable ? 'button' : undefined}
            onClick={clickable ? () => onCategoryClick!(category) : undefined}
            className={`flex items-center justify-between gap-4 text-[13px] w-full min-h-11 rounded-lg -mx-2 px-2 transition-colors duration-200 ${
              clickable ? 'cursor-pointer text-left hover:bg-surface-hover' : ''
            }`}
          >
            <div className="flex items-center gap-1.5 text-text-secondary">
              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: ACTIVITY_CATEGORY_COLOR[category] }} />
              {ACTIVITY_CATEGORY_LABEL[category]}
            </div>
            <span className="flex items-center gap-2.5 shrink-0">
              <span className="font-display font-bold text-text tabular-nums">{datum[category]}</span>
              {clickable && <ChevronRight size={14} strokeWidth={2.5} className="text-text-light" />}
            </span>
          </RowTag>
        );
      })}
    </div>
  </>
);

interface TotalLabelProps {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  index?: number;
}

// The four category colors are deliberately one navy family, not four distinct hues (see
// ACTIVITY_CATEGORY_COLOR's own comment) — which reads as "on-brand" but makes adjacent segments
// within one stacked bar genuinely hard to tell apart by color alone. A small bold total above
// each bar gives the one number most worth reading (how much happened that day) without needing
// to hover or tap every bar to add its segments up by eye.
const makeTotalLabel = (data: readonly ActivityDatum[], activeOrder: readonly ActivityCategory[]) =>
  function TotalLabel({ x, y, width, index }: TotalLabelProps) {
    const nx = Number(x), ny = Number(y), nw = Number(width);
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nw) || index == null) return null;
    const total = activeOrder.reduce((sum, c) => sum + data[index][c], 0);
    if (total === 0) return null;
    return (
      <text
        x={nx + nw / 2}
        y={ny - 8}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fontFamily="var(--font-display)"
        fill="var(--color-text-secondary)"
        className="tabular-nums"
      >
        {total}
      </text>
    );
  };

// Phone version of the tap-to-pin breakdown: one fixed row of equal cells — the day and its total,
// then one per non-zero category (count over label) — instead of a titled panel of 44px rows. Equal
// grid columns mean it never wraps, however many categories there are. Closes on a tap outside
// the chart or on the same bar again (see ActivityTrendChart).
const CompactBreakdown = ({
  datum,
  activeCategories,
  onCategoryClick,
}: {
  datum: ActivityDatum;
  activeCategories: ReadonlySet<ActivityCategory>;
  onCategoryClick: (category: ActivityCategory) => void;
}) => {
  const shown = ACTIVITY_CATEGORY_ORDER.filter((c) => activeCategories.has(c) && datum[c] > 0);
  const total = shown.reduce((sum, c) => sum + datum[c], 0);
  return (
    <div
      role="status"
      className="grid gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ gridTemplateColumns: `repeat(${shown.length + 1}, minmax(0, 1fr))` }}
    >
      <div className="flex flex-col items-center justify-center gap-0.5 min-h-12 px-1 rounded-xl bg-primary-700 text-white">
        <span className="text-sm font-display font-bold tabular-nums leading-none">{total}</span>
        <span className="text-[10px] font-medium text-white/75 leading-none">{datum.label}</span>
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
          <span className="max-w-full truncate text-[10px] font-medium text-text-muted leading-none">{ACTIVITY_CATEGORY_LABEL[category]}</span>
        </button>
      ))}
    </div>
  );
};

const ChartTooltip = ({ active, payload, activeCategories }: ChartTooltipProps) => {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <PinnedBreakdown title={datum.label} variant="tooltip" className="min-w-[160px]">
      <BreakdownRows datum={datum} activeCategories={activeCategories} />
    </PinnedBreakdown>
  );
};

/**
 * Both "nothing to plot" cases — no category selected, and no activity in the window — share this
 * shell, but only the second is a genuine empty state worth a way out: "no category selected" is a
 * filter the viewer just set two seconds ago (the toggle is right above), not something to create
 * your way out of, so it keeps the plain icon + line. "No activity yet" gets the CTA.
 */
const ChartEmptyState = ({
  message,
  tinted,
  action,
}: {
  message: string;
  tinted: boolean;
  action?: { label: string; onClick: () => void };
}) => (
  <div
    className={`flex flex-col items-center justify-center rounded-2xl border border-dashed gap-3 px-5 animate-in fade-in duration-500 ${
      tinted ? 'border-border-hover bg-primary-500/[0.03]' : 'border-border/60 bg-surface/30'
    }`}
    style={{ height: ACTIVITY_CHART_HEIGHT }}
  >
    {tinted ? (
      <div className="flex items-center justify-center size-11 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm shadow-primary-900/20">
        <BarChart3 size={19} />
      </div>
    ) : (
      <div className="p-3 rounded-full bg-surface border border-border/40">
        <BarChart3 size={20} className="text-text-light" />
      </div>
    )}
    <p className={`text-sm text-center max-w-[26rem] ${tinted ? 'font-display font-bold text-text' : 'font-medium text-text-muted'}`}>{message}</p>
    {action && (
      <Button size="sm" className="rounded-full mt-1" onClick={action.onClick}>
        <Plus size={13} strokeWidth={2.75} />
        {action.label}
      </Button>
    )}
  </div>
);

export const ActivityTrendChart = ({ items, activeCategories, groupBy }: ActivityTrendChartProps) => {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [drilldownCategory, setDrilldownCategory] = useState<ActivityCategory | null>(null);
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);

  // Phones: a tap anywhere outside the chart dismisses the pinned breakdown straight away, instead
  // of it staying up until the same bar is tapped again. Skipped while the drill-down modal is open
  // — it renders in a portal outside rootRef and needs `selectedIndex` to stay set.
  useEffect(() => {
    if (!isMobile || selectedIndex === null || drilldownCategory) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setSelectedIndex(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isMobile, selectedIndex, drilldownCategory]);

  // Bucket indices mean something different per granularity (e.g. index 3 of 7 days vs. index 3
  // of 4 quarters) — clear any pinned selection rather than let it silently point at the wrong
  // bar. Resetting during render (the React-recommended way to reset state on a prop change)
  // instead of an effect avoids an extra cascading render.
  const [prevGroupBy, setPrevGroupBy] = useState(groupBy);
  if (groupBy !== prevGroupBy) {
    setPrevGroupBy(groupBy);
    setSelectedIndex(null);
    setDrilldownCategory(null);
  }

  const activeOrder = useMemo(() => ACTIVITY_CATEGORY_ORDER.filter((c) => activeCategories.has(c)), [activeCategories]);

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
    const max = Math.max(1, ...data.map((d) => ACTIVITY_CATEGORY_ORDER.reduce((sum, c) => sum + d[c], 0)));
    return data.map((d) => ({ ...d, track: max }));
  }, [data]);
  const categoryTotals = useMemo(() => {
    const totals = {} as Record<ActivityCategory, number>;
    for (const category of ACTIVITY_CATEGORY_ORDER) totals[category] = data.reduce((sum, d) => sum + d[category], 0);
    return totals;
  }, [data]);
  const windowTotal = activeOrder.reduce((sum, c) => sum + categoryTotals[c], 0);

  if (activeOrder.length === 0) {
    return <ChartEmptyState tinted={false} message="No categories selected — pick one above to see its trend" />;
  }

  if (!hasData) {
    return (
      <ChartEmptyState
        tinted
        message="No activity in this period yet"
        action={{ label: 'New delegation', onClick: () => navigate('/tasks?create=1') }}
      />
    );
  }

  // Phones get an explicit bar width — left to barCategoryGap alone, bars rendered as thin slivers
  // on a narrow card. ~70% of each bucket's share of a ~300px plot, capped at 30px, so a 12-bucket
  // view still leaves a gap between bars instead of running them together.
  // Desktop gets a fixed, chunky width too; left to Recharts it drew ~12px sticks.
  const mobileBarSize = isMobile ? Math.min(28, Math.floor((300 / data.length) * 0.66)) : data.length <= 8 ? 30 : 20;

  // Whole-number ticks only (these are item counts), and no more ticks than the tallest bar has
  // steps. Asking for the default five with `allowDecimals={false}` made a quiet week whose tallest
  // bar is 2 get an axis running 0-4, so every bar and its gray track stopped halfway up the plot.
  const yMax = chartData[0]?.track ?? 1;
  const yTickCount = yMax < 4 ? yMax + 1 : 5;

  const selectedDatum = selectedIndex !== null ? data[selectedIndex] : null;
  // Bars read at full, real color until the user actually taps one to isolate it — no ambient
  // dimming of "not today" bars, which used to make legitimate data look washed-out for no reason.
  const cellOpacity = (i: number) => (selectedIndex === null || i === selectedIndex ? 1 : 0.25);

  return (
    <div ref={rootRef} className="flex flex-col gap-3 sm:gap-4 w-full">
      {/* The inline "Completion" bar that used to live here is gone — that number now has its own
          proper home in the Compliance card's ring gauge, so it doesn't need a second, redundant
          restatement squeezed above the chart. */}

      {/* Recharts' built-in "accessibility layer" wraps the chart in its own focusable
          <div tabIndex={0}>, which the browser then outlines by default on click — a stray black
          box around the whole chart. It's redundant here anyway: the sr-only buttons below
          already give keyboard users the same tap-to-pin breakdown, so the built-in layer (whose
          own per-bar keyboard handling we don't use) is turned off at the source instead of
          fighting its focus outline with CSS. */}
      {/* Phones: the headline first (how much happened in this window), then one cell per category
          with its colour, count and name, which doubles as the chart's legend. Desktop has the
          category filter chips above the chart for that. */}
      {isMobile && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-display font-bold text-text tabular-nums leading-none">{windowTotal}</span>
            <span className="text-xs font-medium text-text-muted">items in this period</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {activeOrder.map((category) => (
              <div key={category} className="flex items-center justify-between gap-2 h-9 px-2.5 rounded-xl bg-surface-hover/60 border border-border/40 min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span aria-hidden="true" className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: ACTIVITY_CATEGORY_COLOR[category] }} />
                  <span className="text-xs font-medium text-text-secondary truncate">{ACTIVITY_CATEGORY_LABEL[category]}</span>
                </span>
                <span className="text-sm font-display font-bold text-text tabular-nums">{categoryTotals[category]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="w-full cursor-pointer" style={{ height: ACTIVITY_CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            accessibilityLayer={false}
            // The right/left gutters stay at 0 — the axis below reserves its own width when it's
            // shown, and an extra `left` offset (this once carried `left: -20`) shifts the plot
            // area far enough on a narrow mobile card to clip the first bar against the edge.
            // `top` grew from 10 to 24 to leave room for the new total-count label sitting just
            // above the tallest bar, which the old margin clipped against the card's own edge.
            margin={{ top: 24, right: 10, left: 0, bottom: 0 }}
            barCategoryGap="40%"
            onClick={(state) => {
              // Recharts 3 reports this as a string ("3"), not a number — the old
              // `typeof === 'number'` check never passed, so tapping a bar pinned nothing.
              const raw = state?.activeTooltipIndex;
              const index = raw == null ? NaN : Number(raw);
              if (Number.isInteger(index)) setSelectedIndex((prev) => (prev === index ? null : index));
            }}
          >
            {/* Added a subtle grid to anchor the data visually */}
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
            />

            {/* Each category bar fills with a two-stop vertical gradient of its own flat token
                color rather than one solid fill — the same "flat reads as dull" fix applied to the
                gauges and KPI tiles, here as a lighter highlight along the top of each segment
                fading into its real tone, which is what gives a stacked bar actual depth. */}
            <defs>
              {ACTIVITY_CATEGORY_ORDER.map((category) => (
                <linearGradient key={category} id={`activity-bar-${category}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACTIVITY_CATEGORY_COLOR[category]} stopOpacity={0.75} />
                  <stop offset="100%" stopColor={ACTIVITY_CATEGORY_COLOR[category]} stopOpacity={1} />
                </linearGradient>
              ))}
            </defs>

            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }}
              dy={12}
            />

            {/* Until now the chart had no value axis at all, so a bar's actual magnitude was
                unreadable without hovering or tapping it — the grid lines were decorative rather
                than measurable. Hidden on mobile, where the axis gutter costs more plot width than
                the reading is worth (the tap-to-pin panel below covers that case), and integer-only
                because these are item counts: Recharts would otherwise label a 0-3 range "0, 0.75,
                1.5…". `width={28}` is just enough for the two-digit counts this chart realistically
                shows while keeping the bars centred. */}
            {!isMobile && (
              <YAxis
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
                tickCount={yTickCount}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }}
              />
            )}

            {/* Stays mounted on phones but renders nothing there — the chart's onClick reads
                `activeTooltipIndex`, which Recharts only tracks while a Tooltip exists. On touch the
                visible tooltip popped up on tap and lingered on top of the chart, duplicating the
                pinned breakdown below. */}
            <Tooltip
              cursor={isMobile ? false : <NarrowCursor />}
              content={(props) => (isMobile ? null : <ChartTooltip {...props} activeCategories={activeCategories} />)}
              isAnimationActive={false} // Prevents jitter on fast hovering
            />

            {/* Stacked Bars — one per active category, in a fixed order, so the stack doesn't
                reshuffle as categories are toggled. Opacity reflects the tapped/selected bar once
                one is picked, so selection reads clearly against the rest of the chart. A
                surface-colored stroke outlines every segment — with all four categories sharing
                one navy family (see ACTIVITY_CATEGORY_COLOR), adjacent segments were otherwise
                nearly impossible to tell apart inside one stacked bar; the stroke gives each one a
                crisp edge regardless of how close its neighbor's tone is. */}
            <XAxis xAxisId="track" dataKey="label" hide />
            <Bar
              xAxisId="track"
              dataKey="track"
              fill="var(--color-surface-hover)"
              radius={8}
              maxBarSize={BAR_WIDTH}
              barSize={mobileBarSize}
              isAnimationActive={false}
              activeBar={false}
            />

            {activeOrder.map((category, idx) => {
              const isTopOfStack = idx === activeOrder.length - 1;
              return (
                <Bar
                  key={category}
                  dataKey={category}
                  stackId="stack"
                  radius={isTopOfStack ? [8, 8, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={BAR_WIDTH}
                  barSize={mobileBarSize}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  label={isTopOfStack ? makeTotalLabel(data, activeOrder) : undefined}
                >
                  {data.map((d, i) => (
                    <Cell key={d.label} fill={`url(#activity-bar-${category})`} fillOpacity={cellOpacity(i)} className="transition-all duration-300" />
                  ))}
                </Bar>
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Keyboard-accessible proxy for the same pin interaction the mouse gets via the chart's
          onClick — Recharts doesn't expose per-bar focus/keyboard handling, so without this a
          keyboard-only user could pin a breakdown on the gauges and Compare Dashboard chips but
          not here. Hidden until focused so it doesn't visually duplicate the x-axis labels for
          mouse/touch users. */}
      {/* No negative margin pulling this row up into the chart — the parent's `gap-4` owns the
          spacing, and the row is zero-height until something in it takes focus anyway. */}
      <div className="flex flex-wrap gap-1">
        {data.map((d, i) => (
          <button
            key={d.label}
            type="button"
            onClick={() => setSelectedIndex((prev) => (prev === i ? null : i))}
            aria-pressed={selectedIndex === i}
            className="sr-only focus:not-sr-only focus:relative focus:z-10 focus:px-2.5 focus:py-1 focus:rounded-md focus:border focus:border-border focus:bg-surface focus:text-[11px] focus:font-medium focus:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none"
          >
            {d.label}: see breakdown
          </button>
        ))}
      </div>

      {/* Tap-to-pin breakdown — same data the hover tooltip shows, kept visible after the tap so
          it works on touch devices (no hover) and doesn't disappear the moment a finger lifts.
          Its rows are clickable here (never on the hover tooltip — see BreakdownRows) since a
          pinned panel actually stays put long enough to be clicked. */}
      {selectedDatum && isMobile ? (
        <CompactBreakdown
          datum={selectedDatum}
          activeCategories={activeCategories}
          onCategoryClick={setDrilldownCategory}
        />
      ) : selectedDatum ? (
        <PinnedBreakdown title={selectedDatum.label} onClose={() => setSelectedIndex(null)}>
          <BreakdownRows datum={selectedDatum} activeCategories={activeCategories} onCategoryClick={setDrilldownCategory} />
        </PinnedBreakdown>
      ) : (
        <BreakdownHint>Tap a bar to see its full breakdown</BreakdownHint>
      )}

      {drilldownCategory && selectedIndex !== null && (
        <DrilldownModal
          open
          onClose={() => setDrilldownCategory(null)}
          title={`${ACTIVITY_CATEGORY_LABEL[drilldownCategory]} — ${data[selectedIndex].label}`}
          rows={itemsInRange(items, drilldownCategory, buckets[selectedIndex].start, buckets[selectedIndex].end)}
          viewAllHref={
            drilldownCategory === 'delegation' ? '/tasks'
              : drilldownCategory === 'ticket' ? '/tickets'
              : drilldownCategory === 'checklist' ? '/checklists'
              : '/todo'
          }
          viewAllLabel={`View all ${ACTIVITY_CATEGORY_LABEL[drilldownCategory].toLowerCase()}s`}
        />
      )}
    </div>
  );
};
