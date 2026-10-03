import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DotItemDotProps } from 'recharts';
import { EmptyState } from '../../../components';
import { formatBucket, formatPercent } from './analyticsDisplay';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

export type TrendGroupBy = 'day' | 'week' | 'month' | 'year' | 'none';

/** Only the most recent buckets are drawn: a 40-bucket daily series is unreadable on a phone. */
const MAX_POINTS = 24;

// The report endpoints name the single whole-range bucket 'range' (groupBy=none), whatever grouping
// the page asked for, so the label has to follow the bucket, not the control.
const labelFor = (bucket: string, groupBy: TrendGroupBy) => formatBucket(bucket, bucket === 'range' ? 'none' : groupBy);

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
  /** Each end can be a number or 'auto'. Rates pass [0, 100]; a count or duration passes [0, 'auto'] so
   *  nothing is clipped. */
  yDomain?: [number | 'auto', number | 'auto'];
}

// Renders a plain dot on every point except the last, and a bigger dot with a soft halo ring on
// the last one — a quiet way to say "this is where things stand right now" without a separate
// label crowding the chart. `key` is spread from `dotProps` (React needs it on the element it's
// applied to, not passed a second time) so the halo circle underneath doesn't warn about a
// missing key when Recharts renders one dot per data point.
const makeEndpointDot = (color: string, lastIndex: number) => (dotProps: DotItemDotProps) => {
  const { cx, cy, index } = dotProps;
  if (cx == null || cy == null || index !== lastIndex) return <g key={`dot-${index}`} />;
  return (
    <g key={`dot-${index}`}>
      <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.18} />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
    </g>
  );
};

export const ReportTrendChart = ({ data, series, groupBy, valueSuffix = '', yDomain }: ReportTrendChartProps) => {
  const points = useMemo(() => data.slice(-MAX_POINTS), [data]);
  const hasValues = useMemo(() => points.some((row) => series.some((s) => row[s.key] != null)), [points, series]);

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
      <EmptyState
        size="compact"
        icon={Activity}
        title="No data for this period"
        description="Try a wider date range or a different grouping."
      />
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
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full shrink-0" style={{ background: s.color }} aria-hidden="true" />
              <span className="text-xs font-display font-medium text-text-secondary">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* role="img" hides everything inside it from assistive tech, so the real numbers live in the
          sr-only table next to it, not inside it. */}
      <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={series.length > 1 ? CHART_HEIGHT - LEGEND_HEIGHT : CHART_HEIGHT}>
          <AreaChart data={points} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
              width={40}
              domain={yDomain}
              tickFormatter={(v: unknown) => `${v}${valueSuffix}`}
            />
            <Tooltip
              content={<ChartTooltip valueSuffix={valueSuffix} formatLabel={formatLabel} />}
              cursor={{ stroke: 'var(--color-text-light)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.5}
                fill={`url(#trend-fill-${s.key})`}
                dot={makeEndpointDot(s.color, points.length - 1)}
                activeDot={{ r: 5, fill: s.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                connectNulls
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
