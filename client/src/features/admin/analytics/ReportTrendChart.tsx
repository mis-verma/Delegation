import { useMemo } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DotItemDotProps } from 'recharts';
import { cn } from '@/lib/utils';
import { EmptyState, IconChip } from '../../../components';
import { useIsMobile } from '../../../lib/useMediaQuery';
import { formatPercent, trendBucketLabel, trendTrimNote, visibleTrendPoints } from './analyticsDisplay';

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

const formatDelta = (delta: number, valueSuffix: string) => {
  const rounded = Math.round(Math.abs(delta) * 10) / 10;
  if (rounded === 0) return 'No change';
  const sign = delta > 0 ? '+' : '-';
  return valueSuffix === '%' ? `${sign}${rounded} pts` : `${sign}${rounded}${valueSuffix}`;
};

type Row = Record<string, unknown>;

const numberAt = (row: Row | undefined, key: string): number | null => {
  const v = row?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

const previousValue = (points: Row[], index: number, key: string): number | null => {
  for (let i = index - 1; i >= 0; i--) {
    const v = numberAt(points[i], key);
    if (v !== null) return v;
  }
  return null;
};

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: { value: number; name: string; color: string; dataKey?: string }[];
  valueSuffix?: string;
  formatLabel: (bucket: string) => string;
  points: Row[];
  series: TrendSeries[];
}

const ChartTooltip = ({ active, payload, label, valueSuffix = '', formatLabel, points, series }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  const index = points.findIndex((row) => String(row.bucket) === label);
  return (
    <div className="flex min-w-48 flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <p className="t-meta font-display font-bold text-text-secondary">{label ? formatLabel(label) : ''}</p>
      {payload.map((p) => {
        const key = series.find((s) => s.label === p.name)?.key ?? p.dataKey ?? '';
        const before = index > 0 ? previousValue(points, index, key) : null;
        const delta = before !== null && typeof p.value === 'number' ? p.value - before : null;
        return (
          <div key={p.name} className="flex items-center justify-between gap-5">
            <div className="flex items-center gap-2">
              <span className="h-1 w-3.5 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="t-card font-display text-text-secondary">{p.name}</span>
            </div>
            <div className="flex items-baseline gap-2">
              {delta !== null && delta !== 0 && (
                <span className={cn('t-meta font-display font-semibold tabular-nums', valueSuffix === '%' ? (delta > 0 ? 'text-success' : 'text-danger') : 'text-text-muted')}>{formatDelta(delta, valueSuffix)}</span>
              )}
              <span className="t-card font-display font-bold text-text tabular-nums">{formatValue(p.value, valueSuffix)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CHART_HEIGHT = 260;
const GOOD_LINE = 80;

export interface ReportTrendChartProps {
  data: Record<string, unknown>[];
  series: TrendSeries[];
  groupBy: TrendGroupBy;
  valueSuffix?: string;
  yDomain?: [number | 'auto' | ((value: number) => number), number | 'auto' | ((value: number) => number)];
}

const makeEndpointDot = (color: string, lastIndex: number, isolated: ReadonlySet<number>) => (dotProps: DotItemDotProps) => {
  const { cx, cy, index } = dotProps;
  if (cx == null || cy == null) return <g key={`dot-${index}`} />;
  if (index !== lastIndex) {
    return isolated.has(index as number)
      ? <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill={color} stroke="var(--color-surface)" strokeWidth={1.5} />
      : <g key={`dot-${index}`} />;
  }
  return (
    <g key={`dot-${index}`}>
      <circle cx={cx} cy={cy} r={8} fill={color} fillOpacity={0.16} />
      <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
    </g>
  );
};

const DASHES = [undefined, '7 4', '2 4', '10 4 2 4'] as const;
const dashFor = (count: number, index: number) => (count > 1 ? DASHES[index % DASHES.length] : undefined);

interface SeriesFigure {
  series: TrendSeries;
  latest: number | null;
  delta: number | null;
  average: number | null;
}

const figureFor = (points: Row[], s: TrendSeries): SeriesFigure => {
  const values = points.map((row) => numberAt(row, s.key));
  let lastIndex = -1;
  values.forEach((v, i) => { if (v !== null) lastIndex = i; });
  const latest = lastIndex >= 0 ? values[lastIndex] : null;
  const before = lastIndex >= 0 ? previousValue(points, lastIndex, s.key) : null;
  const present = values.filter((v): v is number => v !== null);
  return {
    series: s,
    latest,
    delta: latest !== null && before !== null ? latest - before : null,
    average: present.length ? present.reduce((a, b) => a + b, 0) / present.length : null,
  };
};

export const ReportTrendChart = ({ data, series, groupBy, valueSuffix = '', yDomain }: ReportTrendChartProps) => {
  const isMobile = useIsMobile();
  const points = useMemo(() => visibleTrendPoints(data, series.map((s) => s.key), groupBy), [data, groupBy, series]);
  const trimNote = trendTrimNote(data.length, points.length, groupBy);
  const hasValues = useMemo(() => points.some((row) => series.some((s) => row[s.key] != null)), [points, series]);
  const isPercent = valueSuffix === '%';
  const figures = useMemo(() => series.map((s) => figureFor(points, s)), [points, series]);
  const single = series.length === 1;

  const isolatedBySeries = useMemo(() => {
    const result = new Map<string, Set<number>>();
    for (const s of series) {
      const isolated = new Set<number>();
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
        title="Nothing to show for this period"
        description="Pick a longer period, or wait for work to come due."
      />
    );
  }

  if (points.filter((row) => series.some((s) => row[s.key] != null)).length < 2) {
    return (
      <EmptyState
        size="compact"
        icon={Activity}
        title="Not enough data for a trend yet"
        description="A trend line needs at least two periods with figures. Try a longer period or a smaller Show by."
      />
    );
  }

  const showGoodLine = isPercent && Array.isArray(yDomain) && yDomain[1] === 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-8 gap-y-3" aria-label="Latest figures">
        {figures.map(({ series: s, latest, delta, average }, i) => {
          const good = isPercent ? (delta ?? 0) > 0 : null;
          const bad = isPercent ? (delta ?? 0) < 0 : null;
          const Arrow = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
          return (
            <div key={s.key} className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2 t-meta font-display font-semibold text-text-secondary">
                <svg width="22" height="8" className="shrink-0" aria-hidden="true">
                  <line x1="1" y1="4" x2="21" y2="4" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={dashFor(series.length, i)} />
                </svg>
                <span className="truncate">{s.label}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="t-stat font-display font-extrabold leading-none tabular-nums text-text">{formatValue(latest, valueSuffix)}</span>
                {delta !== null && (
                  <IconChip
                    icon={Arrow}
                    tone={good ? 'bg-success' : bad ? 'bg-danger' : 'bg-text-muted'}
                    label={formatDelta(delta, valueSuffix)}
                    labelClassName="tabular-nums"
                    title="Compared with the previous period"
                    soft
                  />
                )}
              </span>
              {average !== null && <span className="t-meta font-medium text-text-muted">Average {formatValue(average, valueSuffix)}</span>}
            </div>
          );
        })}
      </div>

      <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <AreaChart data={points} margin={{ top: 10, right: isMobile ? 6 : 14, left: isMobile ? 0 : 4, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`trend-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 4" strokeOpacity={0.7} />
            <XAxis
              dataKey="bucket"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
              tickMargin={8}
              tickFormatter={(bucket: unknown) => formatLabel(String(bucket))}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }}
              width={isMobile ? 38 : 48}
              domain={yDomain}
              tickFormatter={(v: unknown) => `${v}${valueSuffix}`}
            />
            {showGoodLine && (
              <ReferenceLine
                y={GOOD_LINE}
                stroke="var(--color-success)"
                strokeDasharray="5 5"
                strokeOpacity={0.65}
                label={isMobile ? undefined : { value: 'Good', position: 'insideTopRight', fill: 'var(--color-success)', fontSize: 12, fontWeight: 700 }}
              />
            )}
            <Tooltip
              content={<ChartTooltip valueSuffix={valueSuffix} formatLabel={formatLabel} points={points} series={series} />}
              cursor={{ stroke: 'var(--color-border-hover)', strokeWidth: 1, strokeDasharray: '4 4' }}
              isAnimationActive={false}
            />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeDasharray={dashFor(series.length, i)}
                fill={single ? `url(#trend-fill-${s.key})` : 'none'}
                dot={makeEndpointDot(s.color, points.length - 1, isolatedBySeries.get(s.key) ?? new Set())}
                activeDot={{ r: 5.5, fill: s.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                animationDuration={600}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {(trimNote || showGoodLine) && (
        <p className="px-1 t-meta text-text-muted">
          {showGoodLine ? 'The dashed green line marks 80%, a good score.' : ''}
          {showGoodLine && trimNote ? ' ' : ''}
          {trimNote}
        </p>
      )}

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
