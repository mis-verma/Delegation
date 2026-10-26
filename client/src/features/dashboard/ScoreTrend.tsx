import { useMemo, useState, type ReactElement } from 'react';
import { ScoreColumn } from './scoreBarShape';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, Gauge, Minus, Trophy } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import { ScoreChoice } from './ScoreChoice';
import { CATEGORY_ICON } from './categoryLook';
import { useIsMobile } from '../../lib/useMediaQuery';
import { scoreApi, type ScoreScope, type ScoreTrend as ScoreTrendData, type TrendBucket, type TrendPeriod } from '../../api/scores';
import { SCORE_QUERY_OPTIONS } from './scoreQueries';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { formatPct, roundPct } from '../../lib/percent';
import { MODULE_LABEL as MODULE_NAME } from '../../lib/scoreLabels';
import { SeriesLegend } from './SeriesLegend';
import { SERIES_COLOR, SERIES_LABEL, seriesFor, type ModuleKey, type ScoreMetric, type SeriesKey } from './scoreMetrics';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';

const MODULE_KEYS: readonly ModuleKey[] = ['checklist', 'ticket', 'delegation'];
const MODULE_LABEL: Record<ModuleKey, string> = MODULE_NAME;
const TRACK_FILL = 'color-mix(in oklab, var(--color-primary-500) 9%, transparent)';

interface Point {
  label: string;
  range: string;
  completion: number | null;
  compliance: number | null;
  ontime: number | null;
  due: number;
}

const pointOf = (b: TrendBucket, key: ModuleKey): Point => {
  const m = b[key];
  return { label: b.label, range: b.from === b.to ? b.from : `${b.from} to ${b.to}`, completion: m.completionPct, compliance: m.compliancePct, ontime: m.onTimePct, due: m.due };
};

const TrendTooltip = ({ active, payload, series }: { active?: boolean; payload?: { payload?: Point }[]; series: SeriesKey[] }) => {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="flex min-w-40 flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
      <p className="t-card font-display font-bold text-text">{p.label}</p>
      <p className="t-meta font-medium text-text-muted">{p.range}</p>
      {p.due === 0 ? (
        <p className="t-meta font-display text-text-muted">Nothing was due.</p>
      ) : (
        <>
          {series.map((k) => (
            <p key={k} className="t-meta font-display font-bold text-text"><span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-sm" style={{ backgroundColor: SERIES_COLOR[k] }} />{SERIES_LABEL[k]} {p[k] === null ? 'no data' : formatPct(p[k])}</p>
          ))}
          <p className="t-meta font-medium text-text-muted">{p.due} due</p>
        </>
      )}
    </div>
  );
};

const pointValue = (p: Point, series: SeriesKey[]): number | null => {
  if (p.due === 0) return null;
  const values = series.map((k) => p[k]).filter((v): v is number => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
};

const toneText = (v: number) => (v >= GOOD_FROM ? 'text-success' : v >= FAIR_FROM ? 'text-warning' : 'text-danger');
const toneBg = (v: number) => (v >= GOOD_FROM ? 'bg-success' : v >= FAIR_FROM ? 'bg-warning' : 'bg-danger');

interface ScoreTrendProps {
  metric?: ScoreMetric;
  scope: ScoreScope;
  id: string | undefined;
  period: TrendPeriod;
  from: string;
  to: string;
}

export const ScoreTrend = ({ metric = 'overview', scope, id, period, from, to }: ScoreTrendProps) => {
  const series = seriesFor(metric);
  const isMobile = useIsMobile();
  const [module, setModule] = useState<ModuleKey>('checklist');
  const { data, isPending, isError, refetch } = useQuery<ScoreTrendData>({
    queryKey: ['scores', 'trend', scope, id ?? 'me', period, from, to],
    queryFn: () => scoreApi.trend({ scope, id, period, from, to }),
    ...SCORE_QUERY_OPTIONS,
  });
  const points = useMemo(() => data?.buckets.map((b) => pointOf(b, module)) ?? [], [data, module]);
  const chartPoints = useMemo(() => points.map((p) => (p.due > 0 ? p : { ...p, completion: 100, compliance: 100, ontime: 100 })), [points]);
  const renderLabel = (props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown; index?: number }): ReactElement | null => {
    const point = chartPoints[props.index ?? -1];
    if (!point || point.due === 0 || typeof props.value !== 'number') return null;
    return (
      <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) - 5} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-text)">
        {props.value}
      </text>
    );
  };
  const anyData = points.some((p) => p.due > 0);
  const valued = points.flatMap((p) => { const v = pointValue(p, series); return v === null ? [] : [{ label: p.label, value: v }]; });
  const average = valued.length ? roundPct(valued.reduce((t, x) => t + x.value, 0) / valued.length) : null;
  const best = valued.length ? valued.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const swing = valued.length > 1 ? Math.round((valued[valued.length - 1].value - valued[0].value) * 10) / 10 : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScoreChoice label="Module" value={module} options={MODULE_KEYS} labels={MODULE_LABEL} icons={CATEGORY_ICON} onChange={setModule} />
        <SeriesLegend series={series} labels={SERIES_LABEL} />
      </div>

      {anyData && !isPending && (
        <div className="stat-rise flex flex-wrap gap-1.5" aria-label="Trend summary">
          {average !== null && <IconChip icon={Gauge} tone={toneBg(average)} label={`Average ${formatPct(average)}`} labelClassName={`tabular-nums ${toneText(average)}`} />}
          {best && <IconChip icon={Trophy} tone="bg-primary-600" label={`Best: ${best.label} ${formatPct(best.value)}`} labelClassName="tabular-nums" />}
          {swing !== null && (
            <IconChip
              icon={swing > 0 ? ArrowUp : swing < 0 ? ArrowDown : Minus}
              tone={swing > 0 ? 'bg-success' : swing < 0 ? 'bg-danger' : 'bg-text-muted'}
              label={swing === 0 ? 'Steady' : `${swing > 0 ? 'Up' : 'Down'} ${Math.abs(swing)} pts`}
              labelClassName={`tabular-nums ${swing > 0 ? 'text-success' : swing < 0 ? 'text-danger' : ''}`}
              title="From the first bar to the last"
            />
          )}
        </div>
      )}

      <div className="relative h-48 w-full sm:h-56" role="img" aria-label={anyData ? `${series.map((k) => SERIES_LABEL[k]).join(' and ')} over time for ${MODULE_LABEL[module]}: ${chartPoints.map((p) => `${p.label} ${series.map((k) => `${p[k] ?? 'none'}%`).join(', ')}`).join('; ')}` : 'Nothing was due in this window'}>
        {isPending ? (
          <div className="absolute inset-0 flex items-end justify-around gap-3 px-6 pb-8" role="status" aria-label="Loading the trend">
            {[45, 70, 55, 85, 60, 75, 50].map((h, i) => <Skeleton key={i} className="w-5 rounded-t-md sm:w-8" style={{ height: `${h}%` }} />)}
          </div>
        ) : isError ? (
          <div className="flex h-full items-center">
            <InlineError className="w-full" message="Couldn't load the trend." onRetry={() => void refetch()} />
          </div>
        ) : !anyData ? (
          <div className="h-full w-full rounded-lg bg-surface-hover/50" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartPoints} accessibilityLayer={false} margin={{ top: 22, right: 4, left: isMobile ? 0 : 4, bottom: 0 }} barCategoryGap={isMobile ? '12%' : '24%'} barGap={3}>
              <XAxis dataKey="label" interval={0} tickFormatter={(v: string) => (isMobile && chartPoints.length > 6 ? String(v).slice(0, 3) : v)} tickLine={false} axisLine={false} dy={8} tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600 }} />
              <YAxis domain={[0, 100]} hide={isMobile} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={44} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }} />
              <ReferenceLine y={80} stroke="var(--color-success)" strokeDasharray="4 4" strokeOpacity={0.7} label={isMobile ? undefined : { value: 'Good', position: 'insideTopRight', fill: 'var(--color-success)', fontSize: 12, fontWeight: 700 }} />
              <Tooltip content={<TrendTooltip series={series} />} cursor={false} isAnimationActive={false} />
              {series.map((k, i) => (
                <Bar key={k} dataKey={k} fill={SERIES_COLOR[k]} shape={(p: { x?: number; y?: number; width?: number; height?: number; fill?: string; payload?: { due: number } }) => <ScoreColumn {...p} radius={6} empty={(p.payload?.due ?? 1) === 0} words={i === 0} />} maxBarSize={series.length === 1 ? (isMobile ? 34 : 56) : isMobile ? 24 : 38} background={{ fill: TRACK_FILL, radius: 7 }} animationDuration={500}>
                  {points.length <= 7 && series.length === 1 && <LabelList dataKey={k} position="top" content={renderLabel} />}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="t-meta font-medium text-text-muted">Each bar is a slice of the window. Pale columns had nothing due. The dashed line marks 80%, a good score.</p>
    </div>
  );
};
