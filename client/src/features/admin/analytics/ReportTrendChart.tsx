import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DotItemDotProps } from 'recharts';
import { formatPercent, trendBucketLabel, visibleTrendPoints } from './analyticsDisplay';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

export type TrendGroupBy = 'day' | 'week' | 'month' | 'year' | 'none';

const labelFor = trendBucketLabel;

const formatValue = (value: number | null | undefined, valueSuffix: string) => {
  if (value == null) return 'No data';
  if (valueSuffix === '%') return formatPercent(value);
  return `${Math.round(value * 10) / 10}${valueSuffix}`;
};

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: { value: number; name: string; color: string }[];
  valueSuffix?: string;
  formatLabel: (bucket: string) => string;
}

// Opaque surface and a plain border: no shadow, no backdrop blur.
const ChartTooltip = ({ active, payload, label, valueSuffix = '', formatLabel }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="flex flex-col gap-2 min-w-[160px] p-4 bg-surface border border-border rounded-xl">
      <p className="text-xs font-display font-bold tracking-wide text-text-secondary">{label ? formatLabel(label) : ''}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-sm font-display text-text-secondary">{p.name}</span>
          </div>
          <span className="text-sm font-display font-bold text-text tabular-nums">{formatValue(p.value, valueSuffix)}</span>
        </div>
      ))}
    </div>
  );
};

// KpiSectionShell's loading skeleton reserves a fixed 260px for this whole component (shared
// across every caller, single- and multi-series alike) so nothing jumps when real data swaps in.
// The legend row below adds real height on top of the chart itself, so a multi-series chart
// shrinks by roughly the legend's own footprint to keep the total close to that reserved 260px.
const CHART_HEIGHT = 260;
const LEGEND_HEIGHT = 28;

export interface ReportTrendChartProps {
  data: Record<string, unknown>[];
  series: TrendSeries[];
  /** Used for the x axis and tooltip labels, e.g. 'month' turns "2026-10" into "Oct 2026". */
  groupBy: TrendGroupBy;
  valueSuffix?: string;
  /** Each end can be a number, 'auto', or a function of the data's own min or max. Rates pass
   *  [0, 100]; a count or duration passes [0, 'auto'] so nothing is clipped. */
  yDomain?: [number | 'auto' | ((value: number) => number), number | 'auto' | ((value: number) => number)];
}

// Draws a bigger dot with a soft halo ring on the last point — a quiet way to say "this is where
// things stand right now" without a separate label crowding the chart. A point with an empty bucket
// on both sides would have no line to hang on (empty buckets leave a gap), so it gets a small plain
// dot. `key` is on the element Recharts renders per data point so React does not warn about it.
const makeEndpointDot = (color: string, lastIndex: number, isolated: ReadonlySet<number>) => (dotProps: DotItemDotProps) => {
  const { cx, cy, index } = dotProps;
  if (cx == null || cy == null) return <g key={`dot-${index}`} />;
  if (index !== lastIndex) {
    return isolated.has(index as number)
      ? <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill={color} />
      : <g key={`dot-${index}`} />;
  }
  return (
    <g key={`dot-${index}`}>
      <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.18} />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
    </g>
  );
};

// With several lines, colour alone is not enough (colour-blind readers, greyscale prints): each
// line after the first gets its own dash pattern, and the legend swatch repeats it.
const DASHES = [undefined, '7 4', '2 4', '10 4 2 4'] as const;
const dashFor = (count: number, index: number) => (count > 1 ? DASHES[index % DASHES.length] : undefined);

export const ReportTrendChart = ({ data, series, groupBy, valueSuffix = '', yDomain }: ReportTrendChartProps) => {
  // The same points the section's Export writes out.
  const points = useMemo(() => visibleTrendPoints(data, series.map((s) => s.key), groupBy), [data, groupBy, series]);
  const hasValues = useMemo(() => points.some((row) => series.some((s) => row[s.key] != null)), [points, series]);

  // Per series, the points whose neighbours are both empty (or missing).
  const isolatedBySeries = useMemo(() => {
    const result = new Map<string, Set<number>>();
    for (const s of series) {
      const isolated = new Set<number>();
      // With a dozen points or fewer, every real figure gets a dot so the points are readable and
      // hoverable, not just the line between them. With more, only a point with no neighbours does.
      const dotAll = points.length <= 12;
      points.forEach((row, i) => {
        if (row[s.key] == null) return;
        const before = i > 0 ? points[i - 1][s.key] : null;
        const after = i < points.length - 1 ? points[i + 1][s.key] : null;
        if (dotAll || (before == null && after == null)) isolated.add(i);
      });
      result.set(s.key, isolated);
    }
    return result;
  }, [points, series]);

  const formatLabel = useMemo(() => (bucket: string) => labelFor(bucket, groupBy), [groupBy]);

  // One sentence a screen reader can use instead of the picture: the latest figure per series and
  // what it was in the bucket before.
  const summary = useMemo(() => {
    const latest = points[points.length - 1];
    const previous = points.length > 1 ? points[points.length - 2] : undefined;
    if (!latest) return '';
    const parts = series.map((s) => {
      const now = formatValue(latest[s.key] as number | null | undefined, valueSuffix);
      const before = previous ? `, previous ${formatValue(previous[s.key] as number | null | undefined, valueSuffix)}` : '';
      return `${s.label} ${now}${before}`;
    });
    return `Trend chart for ${formatLabel(String(latest.bucket))}. ${parts.join('. ')}.`;
  }, [points, series, valueSuffix, formatLabel]);

  if (!points.length || !hasValues) {
    return (
      <div className="relative flex h-48 items-end justify-around gap-3 overflow-hidden rounded-xl border border-border/60 bg-surface px-6 pb-6 sm:h-56">
        {/* A faint outline of the chart that would be here, so the empty card still reads as a chart. */}
        {[38, 62, 46, 78, 54, 70, 42].map((h, i) => (
          <span key={i} aria-hidden="true" className="w-full max-w-12 rounded-t-lg bg-primary-500/[0.07] dark:bg-primary-400/10" style={{ height: `${h}%` }} />
        ))}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-t from-surface/90 via-surface/60 to-transparent px-4 text-center">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400">
            <Activity className="size-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-display font-semibold text-text">Nothing to show for this period</p>
          <p className="t-meta text-text-muted">Pick a longer period, or wait for work to come due.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* A hover-only tooltip is the only way to tell two or three colored lines apart at rest —
          fine for a single-series chart (no ambiguity to resolve), but a real gap once there's
          more than one. A persistent legend, not Recharts' default (which doesn't pick up this
          app's tokens), pairs each line's color with its name the same way the tooltip already does. */}
      {series.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
          {series.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <svg width="22" height="8" className="shrink-0" aria-hidden="true">
                <line x1="1" y1="4" x2="21" y2="4" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashFor(series.length, i)} />
              </svg>
              <span className="text-xs font-display font-medium text-text-secondary">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* role="img" hides everything inside it from assistive tech, so the real numbers live in the
          sr-only table next to it, not inside it. */}
      <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={series.length > 1 ? CHART_HEIGHT - LEGEND_HEIGHT : CHART_HEIGHT}>
          <AreaChart data={points} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`trend-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {/* Dashed, not solid — matches the same grid treatment ActivityTrendChart already uses,
                so the two chart types on this dashboard don't disagree on how a background grid
                should look. */}
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" strokeOpacity={0.4} />
            <XAxis
              dataKey="bucket"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
              tickFormatter={(bucket: unknown) => formatLabel(String(bucket))}
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
              width={48}
              domain={yDomain}
              tickFormatter={(v: unknown) => `${v}${valueSuffix}`}
            />
            <Tooltip
              content={<ChartTooltip valueSuffix={valueSuffix} formatLabel={formatLabel} />}
              cursor={{ stroke: 'var(--color-text-light)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.5}
                strokeDasharray={dashFor(series.length, i)}
                fill={`url(#trend-fill-${s.key})`}
                dot={makeEndpointDot(s.color, points.length - 1, isolatedBySeries.get(s.key) ?? new Set())}
                activeDot={{ r: 5, fill: s.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Trend data</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.key} scope="col">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((row) => (
            <tr key={String(row.bucket)}>
              <th scope="row">{formatLabel(String(row.bucket))}</th>
              {series.map((s) => (
                <td key={s.key}>{formatValue(row[s.key] as number | null | undefined, valueSuffix)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReportTrendChart;
