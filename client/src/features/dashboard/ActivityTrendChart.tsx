import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { BarChart3, ChevronRight } from 'lucide-react';
import { useIsMobile } from '../../lib/useMediaQuery';
import { PinnedBreakdown, BreakdownHint } from './PinnedBreakdown';
import { DrilldownModal } from './DrilldownModal';
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

type ActivityDatum = { label: string } & Record<ActivityCategory, number>;

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
 * Both "nothing to plot" cases — no category selected, and no activity in the window — were two
 * near-identical blocks differing only in their copy and one decorative glow.
 */
const ChartEmptyState = ({ message, tinted }: { message: string; tinted: boolean }) => (
  <div
    className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-surface/30 gap-3 animate-in fade-in duration-500"
    style={{ height: ACTIVITY_CHART_HEIGHT }}
  >
    <div className="relative p-3 rounded-full bg-surface border border-border/40">
      {tinted && <div className="absolute inset-0 bg-primary-500/10 blur-md rounded-full" />}
      <BarChart3 size={20} className={`relative z-10 ${tinted ? 'text-primary-500/70' : 'text-text-light'}`} />
    </div>
    <p className="text-sm font-medium text-text-muted text-center px-4">{message}</p>
  </div>
);

export const ActivityTrendChart = ({ items, activeCategories, groupBy }: ActivityTrendChartProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [drilldownCategory, setDrilldownCategory] = useState<ActivityCategory | null>(null);
  const isMobile = useIsMobile();

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

  if (activeOrder.length === 0) {
    return <ChartEmptyState tinted={false} message="No categories selected — pick one above to see its trend" />;
  }

  if (!hasData) {
    return <ChartEmptyState tinted message="No activity in this period yet" />;
  }

  const selectedDatum = selectedIndex !== null ? data[selectedIndex] : null;
  // Bars read at full, real color until the user actually taps one to isolate it — no ambient
  // dimming of "not today" bars, which used to make legitimate data look washed-out for no reason.
  const cellOpacity = (i: number) => (selectedIndex === null || i === selectedIndex ? 1 : 0.25);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* The inline "Completion" bar that used to live here is gone — that number now has its own
          proper home in the Compliance card's ring gauge, so it doesn't need a second, redundant
          restatement squeezed above the chart. */}

      {/* Recharts' built-in "accessibility layer" wraps the chart in its own focusable
          <div tabIndex={0}>, which the browser then outlines by default on click — a stray black
          box around the whole chart. It's redundant here anyway: the sr-only buttons below
          already give keyboard users the same tap-to-pin breakdown, so the built-in layer (whose
          own per-bar keyboard handling we don't use) is turned off at the source instead of
          fighting its focus outline with CSS. */}
      <div className="w-full cursor-pointer" style={{ height: ACTIVITY_CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            accessibilityLayer={false}
            // The right/left gutters stay at 0 — the axis below reserves its own width when it's
            // shown, and an extra `left` offset (this once carried `left: -20`) shifts the plot
            // area far enough on a narrow mobile card to clip the first bar against the edge.
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            barCategoryGap="40%"
            onClick={(state) => {
              const index = state?.activeTooltipIndex;
              if (typeof index === 'number') setSelectedIndex((prev) => (prev === index ? null : index));
            }}
          >
            {/* Added a subtle grid to anchor the data visually */}
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
            />

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
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }}
              />
            )}

            <Tooltip
              cursor={<NarrowCursor />}
              content={(props) => <ChartTooltip {...props} activeCategories={activeCategories} />}
              isAnimationActive={false} // Prevents jitter on fast hovering
            />

            {/* Stacked Bars — one per active category, in a fixed order, so the stack doesn't
                reshuffle as categories are toggled. Opacity reflects the tapped/selected bar once
                one is picked, so selection reads clearly against the rest of the chart. */}
            {activeOrder.map((category, idx) => {
              const isTopOfStack = idx === activeOrder.length - 1;
              return (
                <Bar
                  key={category}
                  dataKey={category}
                  stackId="stack"
                  radius={isTopOfStack ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={BAR_WIDTH}
                >
                  {data.map((d, i) => (
                    <Cell key={d.label} fill={ACTIVITY_CATEGORY_COLOR[category]} fillOpacity={cellOpacity(i)} className="transition-all duration-300" />
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
      {selectedDatum ? (
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
