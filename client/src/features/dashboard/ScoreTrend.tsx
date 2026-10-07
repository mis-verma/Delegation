import { useMemo, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { useIsMobile } from '../../lib/useMediaQuery';
import { scoreApi, type ScoreScope, type ScoreTrend as ScoreTrendData, type TrendBucket, type TrendPeriod } from '../../api/scores';
import { Skeleton } from '../../components/skeleton';
import { SERIES_COLOR, SERIES_LABEL, seriesFor, type ModuleKey, type ScoreMetric, type SeriesKey } from './scoreMetrics';

const MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'checklist', label: 'Checklist' },
  { key: 'ticket', label: 'Tickets' },
  { key: 'delegation', label: 'Delegations' },
];
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
      <p className="text-sm font-display font-bold text-text">{p.label}</p>
      <p className="text-xs font-medium text-text-muted">{p.range}</p>
      {p.due === 0 ? (
        <p className="text-xs font-display text-text-muted">Nothing was due.</p>
      ) : (
        <>
          {series.map((k) => (
            <p key={k} className="text-xs font-display font-bold text-text"><span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-sm" style={{ backgroundColor: SERIES_COLOR[k] }} />{SERIES_LABEL[k]} {p[k] === null ? 'no data' : `${p[k]}%`}</p>
          ))}
          <p className="text-xs font-medium text-text-muted">{p.due} due</p>
        </>
      )}
    </div>
  );
};

interface ScoreTrendProps {
  /** Overview draws completion beside compliance; the other tabs draw one measure. */
  metric?: ScoreMetric;
  scope: ScoreScope;
  id: string | undefined;
  period: TrendPeriod;
  from: string;
  to: string;
}

/**
 * Completion and compliance over time for one module: the selected window cut into a few buckets (the
 * last 7 days, the weeks of a month, the months of a quarter or a year), so a score has a direction.
 * Every bucket is scored by the same server rules as the card itself.
 */
export const ScoreTrend = ({ metric = 'overview', scope, id, period, from, to }: ScoreTrendProps) => {
  const series = seriesFor(metric);
  const isMobile = useIsMobile();
  const [module, setModule] = useState<ModuleKey>('checklist');
  const { data, isPending, isError, refetch } = useQuery<ScoreTrendData>({
    queryKey: ['scores', 'trend', scope, id ?? 'me', period, from, to],
    queryFn: () => scoreApi.trend({ scope, id, period, from, to }),
    staleTime: 60_000,
  });
  const points = useMemo(() => data?.buckets.map((b) => pointOf(b, module)) ?? [], [data, module]);
  // A slice with nothing due is drawn as zero so its empty lane still shows; its number is not printed.
  const chartPoints = useMemo(() => points.map((p) => (p.due > 0 ? p : { ...p, completion: 0, compliance: 0, ontime: 0 })), [points]);
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Module" className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface-hover/50 p-0.5">
          {MODULES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={module === m.key}
              onClick={() => setModule(m.key)}
              className={cn(
                'min-h-8 rounded-full px-3 text-xs font-display font-medium sm:font-bold outline-none transition-colors pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-primary-500/40',
                module === m.key ? 'bg-surface text-primary-700 ring-1 ring-border dark:text-primary-300' : 'text-text-muted hover:text-text',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-display font-bold text-text-secondary">
          {series.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_COLOR[k] }} />{SERIES_LABEL[k]}</span>
          ))}
        </div>
      </div>

      <div className="relative h-48 w-full sm:h-56" role="img" aria-label={anyData ? `${series.map((k) => SERIES_LABEL[k]).join(' and ')} over time for ${MODULES.find((m) => m.key === module)?.label}` : 'Nothing was due in this window'}>
        {isPending ? (
          <div className="absolute inset-0 flex items-end justify-around gap-3 px-6 pb-8" role="status" aria-label="Loading the trend">
            {[45, 70, 55, 85, 60, 75, 50].map((h, i) => <Skeleton key={i} className="w-5 rounded-t-md sm:w-8" style={{ height: `${h}%` }} />)}
          </div>
        ) : isError ? (
          <div className="flex h-full items-center justify-center text-sm font-medium text-text-muted">
            Could not load the trend.&nbsp;
            <button type="button" onClick={() => void refetch()} className="font-bold text-primary-600 hover:underline dark:text-primary-400">Try again</button>
          </div>
        ) : !anyData ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm font-medium text-text-muted">Nothing was due in this window.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartPoints} accessibilityLayer={false} margin={{ top: 22, right: 4, left: isMobile ? 0 : 4, bottom: 0 }} barCategoryGap={isMobile ? '12%' : '24%'} barGap={3}>
              <XAxis dataKey="label" interval={0} tickLine={false} axisLine={false} dy={8} tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600 }} />
              <YAxis domain={[0, 100]} hide={isMobile} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={44} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }} />
              <Tooltip content={<TrendTooltip series={series} />} cursor={false} isAnimationActive={false} />
              {series.map((k) => (
                <Bar key={k} dataKey={k} fill={SERIES_COLOR[k]} radius={[6, 6, 0, 0]} maxBarSize={series.length === 1 ? (isMobile ? 28 : 44) : isMobile ? 20 : 30} background={{ fill: TRACK_FILL, radius: 6 }} animationDuration={500}>
                  {points.length <= 7 && (series.length === 1 || !isMobile) && <LabelList dataKey={k} position="top" content={renderLabel} />}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-xs font-medium text-text-muted">Each bar is a slice of the window, scored the same way as the card. {isMobile && series.length > 1 ? 'Tap a bar for its numbers. ' : ''}Empty slots had nothing due.</p>
    </div>
  );
};
