import { memo, useId, useMemo, type ReactElement, type ReactNode } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useIsMobile } from '../../lib/useMediaQuery';
import type { Scores } from '../../api/scores';
import { formatPct } from '../../lib/percent';
import { MODULE_LABEL } from '../../lib/scoreLabels';
import { Skeleton } from '../../components/skeleton';
import { SeriesLegend } from './SeriesLegend';
import { SERIES_COLOR, SERIES_LABEL, numbersFor, seriesFor, type ModuleKey, type ScoreMetric, type SeriesKey } from './scoreMetrics';

const TRACK_FILL = 'color-mix(in oklab, var(--color-primary-500) 6%, transparent)';
const CHART_TOP = 32;
const X_AXIS_HEIGHT = 30;
const Y_AXIS_WIDTH = 44;

const MODULES: { key: ModuleKey; name: string }[] = [
  { key: 'checklist', name: MODULE_LABEL.checklist },
  { key: 'ticket', name: MODULE_LABEL.ticket },
  { key: 'delegation', name: MODULE_LABEL.delegation },
];

interface Row {
  key: ModuleKey;
  name: string;
  hasData: boolean;
  completion: number | null;
  compliance: number | null;
  ontime: number | null;
}

const rowsFor = (s: Scores): Row[] =>
  MODULES.map(({ key, name }) => {
    const n = numbersFor(s, key);
    return { key, name, hasData: n.hasData, completion: n.completion, compliance: n.compliance, ontime: n.ontime };
  });

const BarTooltip = ({ active, payload, series }: { active?: boolean; payload?: { payload?: Row }[]; series: SeriesKey[] }) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="flex min-w-40 flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
      <p className="t-card font-display font-bold text-text">{row.name}</p>
      {!row.hasData ? (
        <p className="t-meta font-display text-text-muted">Nothing was due.</p>
      ) : (
        series.map((k) => (
          <p key={k} className="t-meta font-display font-bold text-text">
            <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-sm" style={{ backgroundColor: SERIES_COLOR[k] }} />
            {SERIES_LABEL[k]} {row[k] === null ? 'no data' : formatPct(row[k])}
          </p>
        ))
      )}
    </div>
  );
};

const delta = (now: number | null, before: number | null) => (now === null || before === null ? null : Math.round((now - before) * 10) / 10);

const Delta = ({ label, value }: { label: string; value: number | null }) =>
  value === null ? null : (
    <span className={`inline-flex items-center gap-1 t-meta font-display font-semibold tabular-nums ${value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-muted'}`}>
      {label}
      {value > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : value < 0 ? <ArrowDown className="size-3" aria-hidden="true" /> : null}
      {value === 0 ? 'no change' : `${Math.abs(value)} pts`}
    </span>
  );

interface ScoreBarsProps {
  scores: Scores | undefined;
  loading: boolean;
  metric?: ScoreMetric;
  previous?: Scores | undefined;
  onOpenModule?: (module: ModuleKey) => void;
  emptyText?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
}

export const ScoreBars = memo(({ scores, loading, metric = 'overview', previous, onOpenModule, emptyText = 'Nothing due yet', emptyHint, emptyAction }: ScoreBarsProps) => {
  const isMobile = useIsMobile();
  const gradientId = useId().replace(/:/g, '');
  const rows = useMemo(() => (scores ? rowsFor(scores) : []), [scores]);
  const series = seriesFor(metric);
  const barSize = series.length === 1 ? (isMobile ? 64 : 96) : isMobile ? 44 : 64;
  const chartRows = useMemo(() => rows.map((r) => (r.hasData ? r : { ...r, completion: 0, compliance: 0, ontime: 0 })), [rows]);
  const allEmpty = rows.length > 0 && rows.every((r) => !r.hasData);

  const renderLabel = (props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown; index?: number }): ReactElement | null => {
    const row = chartRows[props.index ?? -1];
    if (!row?.hasData || typeof props.value !== 'number') return null;
    const text = formatPct(props.value);
    const pillW = text.length * 7 + 16;
    const pillH = 20;
    const cx = Number(props.x) + Number(props.width) / 2;
    const top = Number(props.y) - pillH - 5;
    return (
      <g>
        <rect x={cx - pillW / 2} y={top} width={pillW} height={pillH} rx={pillH / 2} fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth={1} />
        <text x={cx} y={top + pillH / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-text)">{text}</text>
      </g>
    );
  };

  const summary = rows
    .map((r) => `${r.name}: ${r.hasData ? series.map((k) => `${SERIES_LABEL[k].toLowerCase()} ${r[k] === null ? 'no data' : formatPct(r[k])}`).join(', ') : 'nothing due'}`)
    .join('. ');

  return (
    <div className="flex flex-col gap-3">
      {!allEmpty && <SeriesLegend series={series} labels={SERIES_LABEL} />}

      <div className={`relative ${allEmpty ? 'flex min-h-24 items-center lg:min-h-64' : 'h-56 sm:h-64'} w-full ${onOpenModule ? '[&_.recharts-bar-rectangle]:cursor-pointer' : ''}`} role={allEmpty ? undefined : 'img'} aria-label={allEmpty ? undefined : summary || 'Loading scores'}>
        {loading && !scores ? (
          <div className="absolute inset-0 flex items-end justify-around gap-3 px-6 pb-8" role="status" aria-label="Loading scores">
            {[55, 80, 40].map((h, i) => <Skeleton key={i} className="w-12 rounded-t-lg sm:w-16" style={{ height: `${h}%` }} />)}
          </div>
        ) : allEmpty ? (
          <div role="status" className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface-hover/50 px-4 py-6 text-center lg:min-h-64">
            <p className="t-card font-display font-bold text-text">{emptyText}</p>
            {emptyHint && <p className="max-w-md t-meta font-medium text-text-muted">{emptyHint}</p>}
            {emptyAction}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} accessibilityLayer={false} margin={{ top: CHART_TOP, right: 4, left: isMobile ? 0 : 4, bottom: 0 }} barCategoryGap={isMobile ? '10%' : '16%'} barGap={6}>
              <defs>
                {series.map((k) => (
                  <linearGradient key={k} id={`${gradientId}-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES_COLOR[k]} stopOpacity={0.82} />
                    <stop offset="100%" stopColor={SERIES_COLOR[k]} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="name" interval={0} height={X_AXIS_HEIGHT} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600 }} />
              <YAxis domain={[0, 100]} hide={isMobile} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={Y_AXIS_WIDTH} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }} />
              {!isMobile && <Tooltip content={<BarTooltip series={series} />} cursor={false} isAnimationActive={false} />}
              {series.map((k) => (
                <Bar
                  key={k}
                  dataKey={k}
                  fill={`url(#${gradientId}-${k})`}
                  radius={[8, 8, 0, 0]}
                  maxBarSize={barSize}
                  background={{ fill: TRACK_FILL, radius: 8 }}
                  animationDuration={500}
                  onClick={(d: { payload?: Row }) => { if (d.payload?.hasData) onOpenModule?.(d.payload.key); }}
                >
                  <LabelList dataKey={k} position="top" offset={6} content={renderLabel} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {previous && scores && (
        <ul className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label="Change since the previous period">
          <li className="t-meta font-display font-bold text-text-secondary">Since last period</li>
          {rowsFor(scores).map((r, i) => {
            const before = rowsFor(previous)[i];
            if (!r.hasData && !before.hasData) return null;
            return (
              <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                <span className="w-24 t-meta font-display font-bold text-text">{r.name}</span>
                {series.map((k) => <Delta key={k} label={SERIES_LABEL[k]} value={delta(r[k], before[k])} />)}
              </li>
            );
          })}
        </ul>
      )}

      <table className="sr-only">
        <caption>Completion, compliance and on-time rate by module</caption>
        <thead><tr><th scope="col">Module</th><th scope="col">Completion</th><th scope="col">Compliance</th><th scope="col">On time</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}><th scope="row">{r.name}</th><td>{r.completion ?? 'No data'}</td><td>{r.compliance ?? 'No data'}</td><td>{r.ontime ?? 'No data'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
ScoreBars.displayName = 'ScoreBars';
