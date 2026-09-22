import { Activity } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DotItemDotProps } from 'recharts';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: { value: number; name: string; color: string }[];
  valueSuffix?: string;
}

const ChartTooltip = ({ active, payload, label, valueSuffix = '' }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="flex flex-col gap-2 min-w-[160px] p-4 bg-surface/95 backdrop-blur-md border border-border rounded-xl shadow-xl">
      <p className="text-xs font-display font-bold tracking-wide text-text-muted">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-sm font-display text-text-secondary">{p.name}</span>
          </div>
          <span className="text-sm font-display font-bold text-text tabular-nums">
            {p.value}
            {valueSuffix}
          </span>
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

interface ReportTrendChartProps {
  data: Record<string, unknown>[];
  series: TrendSeries[];
  valueSuffix?: string;
  yDomain?: [number, number];
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

export const ReportTrendChart = ({ data, series, valueSuffix = '', yDomain }: ReportTrendChartProps) => {
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[260px] gap-3 rounded-xl border-2 border-dashed border-border">
        <div className="flex items-center justify-center text-text-light">
          <Activity className="w-6 h-6" />
        </div>
        <p className="text-sm font-display font-medium text-text">No data for this period</p>
        <p className="text-xs font-display text-text-muted -mt-2">Adjust the date range or grouping to see a trend.</p>
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
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full shrink-0" style={{ background: s.color }} aria-hidden="true" />
              <span className="text-xs font-display font-medium text-text-secondary">{s.label}</span>
            </div>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={series.length > 1 ? CHART_HEIGHT - LEGEND_HEIGHT : CHART_HEIGHT}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
          <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} width={40} domain={yDomain} />
          <Tooltip
            content={<ChartTooltip valueSuffix={valueSuffix} />}
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
              // Same soft color-matched glow RadialGauge's fill arc uses — a plain CSS drop-shadow
              // on the line itself, not an SVG filter primitive, so there's no id/url() to fail to
              // resolve.
              style={{ filter: `drop-shadow(0 2px 3px color-mix(in srgb, ${s.color} 35%, transparent))` }}
              fill={`url(#trend-fill-${s.key})`}
              dot={makeEndpointDot(s.color, data.length - 1)}
              activeDot={{ r: 5, fill: s.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
