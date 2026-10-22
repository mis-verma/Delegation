import { memo, useId, useMemo, type CSSProperties, type ReactElement } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, ChevronRight, Trophy } from 'lucide-react';
import { useIsMobile } from '../../lib/useMediaQuery';
import { ScoreColumn } from './scoreBarShape';
import type { Scores } from '../../api/scores';
import { formatPct } from '../../lib/percent';
import { MODULE_LABEL } from '../../lib/scoreLabels';
import { SeriesLegend } from './SeriesLegend';
import { ScoreToneChip } from './ScoreToneChip';
import { SERIES_COLOR, SERIES_LABEL, numbersFor, seriesFor, type ModuleKey, type ScoreMetric, type SeriesKey } from './scoreMetrics';

const TRACK_FILL = 'color-mix(in oklab, var(--color-primary-500) 6%, transparent)';

const MODULES: { key: ModuleKey; name: string }[] = [
  { key: 'checklist', name: MODULE_LABEL.checklist },
  { key: 'ticket', name: MODULE_LABEL.ticket },
  { key: 'delegation', name: MODULE_LABEL.delegation },
];

interface Row {
  key: ModuleKey;
  name: string;
  completion: number | null;
  compliance: number | null;
  ontime: number | null;
  notes: Record<SeriesKey, string>;
  hasData: boolean;
}

const rowsFor = (s: Scores): Row[] =>
  MODULES.map(({ key, name }) => {
    const n = numbersFor(s, key);
    return {
      key, name, completion: n.completion, compliance: n.compliance, ontime: n.ontime, hasData: n.hasData,
      notes: { completion: n.completionNote, compliance: n.complianceNote, ontime: n.ontimeNote },
    };
  });

const BarTooltip = ({ active, payload, series }: { active?: boolean; payload?: { payload?: Row }[]; series: SeriesKey[] }) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="flex min-w-44 flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <p className="t-card font-display font-bold text-text">{row.name}</p>
      {row.hasData ? (
        series.map((k) => (
          <div key={k} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: SERIES_COLOR[k] }} />
            <div className="min-w-0">
              <p className="t-meta font-display font-bold text-text">{SERIES_LABEL[k]} {row[k] === null ? 'no data' : formatPct(row[k])}</p>
              <p className="t-meta font-display text-text-muted">{row.notes[k]}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="t-meta font-display text-text-muted">Nothing due</p>
      )}
    </div>
  );
};

const ModuleTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => (
  <g transform={`translate(${x ?? 0},${(y ?? 0) + 6})`}>
    <text textAnchor="middle" dy={12} fill="var(--color-text-secondary)" fontSize={12} fontWeight={700}>{payload?.value ?? ''}</text>
  </g>
);

interface ScoreBarsProps {
  scores: Scores | undefined;
  loading: boolean;
  metric?: ScoreMetric;
  previous?: Scores | undefined;
  onOpenModule?: (module: ModuleKey) => void;
  emptyText?: string;
}

const delta = (now: number | null, before: number | null) => (now === null || before === null ? null : now - before);

const Delta = ({ label, value }: { label: string; value: number | null }) =>
  value === null ? (
    <span className="t-meta font-medium text-text-muted">{label} <span className="text-text-light">no data</span></span>
  ) : (
    <span className={`inline-flex items-center gap-0.5 t-meta font-display font-bold tabular-nums ${value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-muted'}`}>
      <span className="font-medium text-text-muted">{label}</span>
      {value > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : value < 0 ? <ArrowDown className="size-3" aria-hidden="true" /> : null}
      {value === 0 ? 'no change' : `${Math.abs(value)} pts`}
    </span>
  );

const moduleAverage = (row: Row, series: SeriesKey[]) => {
  const values = series.map((k) => row[k]).filter((v): v is number => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
};

const ModuleTiles = ({ rows, series, onOpenModule }: { rows: Row[]; series: SeriesKey[]; onOpenModule?: (module: ModuleKey) => void }) => (
  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Scores by module">
    {rows.map((r, index) => {
      const interactive = !!onOpenModule && r.hasData;
      const body = (
        <>
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="t-card font-display font-bold text-text">{r.name}</span>
              {r.hasData && <ScoreToneChip value={moduleAverage(r, series)} />}
            </span>
            {r.hasData ? (
              interactive && <ChevronRight className="size-4 shrink-0 text-text-light" aria-hidden="true" />
            ) : (
              <span className="t-meta font-display font-semibold text-text-light">Nothing due</span>
            )}
          </span>
          {r.hasData && series.map((k) => (
            <span key={k} className="flex min-w-0 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 t-meta text-text-muted">
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SERIES_COLOR[k] }} />
                  <span className="truncate">{SERIES_LABEL[k]}</span>
                </span>
                <span className={`shrink-0 t-card font-display font-extrabold tabular-nums ${r[k] === null ? 'text-text-light' : 'text-text'}`}>{r[k] === null ? '-' : formatPct(r[k])}</span>
              </span>
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
                <span className="bar-grow block h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${r[k] === null ? 0 : Math.max(3, Math.min(100, r[k]))}%`, backgroundColor: SERIES_COLOR[k] }} />
              </span>
            </span>
          ))}
        </>
      );
      const cls = 'flex w-full min-w-0 flex-col gap-2 rounded-xl border border-border/60 bg-surface p-3 text-left';
      return (
        <li key={r.key} className="stat-rise" style={{ '--stat-delay': `${index * 70}ms` } as CSSProperties}>
          {interactive ? (
            <button type="button" onClick={() => onOpenModule?.(r.key)} className={`${cls} cursor-pointer outline-none transition-colors duration-150 hover:border-primary-400/60 focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.99]`}>
              {body}
            </button>
          ) : (
            <div className={`${cls} ${r.hasData ? '' : 'bg-surface-hover/30'}`}>{body}</div>
          )}
        </li>
      );
    })}
  </ul>
);

const CHART_TOP = 32;
const X_AXIS_HEIGHT = 30;
const Y_AXIS_WIDTH = 44;
const BAR_GAP = 6;

export const ScoreBars = memo(({ scores, loading, metric = 'overview', previous, onOpenModule, emptyText = 'Nothing due yet' }: ScoreBarsProps) => {
  const isMobile = useIsMobile();
  const gradientId = useId().replace(/:/g, '');
  const rows = useMemo(() => (scores ? rowsFor(scores) : []), [scores]);
  const series = seriesFor(metric);
  const barSize = series.length === 1 ? (isMobile ? 64 : 96) : isMobile ? 44 : 64;
  const chartRows = useMemo(() => rows.map((r) => (r.hasData ? r : { ...r, completion: 100, compliance: 100, ontime: 100 })), [rows]);
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
        <text x={cx} y={top + pillH / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-text)">
          {text}
        </text>
      </g>
    );
  };

  const summary = rows
    .map((r) => `${r.name}: ${r.hasData ? series.map((k) => `${SERIES_LABEL[k].toLowerCase()} ${r[k] === null ? 'no data' : formatPct(r[k])}`).join(', ') : 'nothing due'}`)
    .join('. ');

  return (
    <div className="flex flex-col gap-3">
      {!allEmpty && <SeriesLegend series={series} labels={SERIES_LABEL} />}

      <div className={`relative ${allEmpty ? 'flex min-h-24 lg:min-h-64 items-center' : 'h-56 sm:h-64'} w-full ${onOpenModule ? '[&_.recharts-bar-rectangle]:cursor-pointer' : ''}`} role="img" aria-label={allEmpty ? emptyText : summary || 'Loading scores'}>
        {loading && !scores ? (
          <div
            className="absolute inset-0 flex"
            style={{ paddingTop: CHART_TOP, paddingBottom: X_AXIS_HEIGHT, paddingLeft: isMobile ? 0 : Y_AXIS_WIDTH + 4, paddingRight: 4 }}
            role="status"
            aria-label="Loading scores"
          >
            {[55, 80, 40].map((h, i) => (
              <div key={i} className="flex flex-1 items-end justify-center" style={{ gap: BAR_GAP }}>
                <div className="rounded-t-lg bg-surface-hover animate-pulse" style={{ height: `${h}%`, width: barSize }} />
                {series.length > 1 && <div className="rounded-t-lg bg-surface-hover animate-pulse" style={{ height: `${Math.max(20, h - 15)}%`, width: barSize }} />}
              </div>
            ))}
          </div>
        ) : allEmpty ? (
          <div className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-surface-hover/30 px-4 py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-text-light" aria-hidden="true">
              <Trophy className="size-4.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="t-card font-display font-semibold text-text">{emptyText}</span>
              <span className="t-meta text-text-muted">Bars appear once something comes due in this period.</span>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} accessibilityLayer={false} margin={{ top: CHART_TOP, right: 4, left: isMobile ? 0 : 4, bottom: 0 }} barCategoryGap={isMobile ? '10%' : '16%'} barGap={BAR_GAP}>
              <defs>
                {series.map((k) => (
                  <linearGradient key={k} id={`${gradientId}-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES_COLOR[k]} stopOpacity={0.82} />
                    <stop offset="100%" stopColor={SERIES_COLOR[k]} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="name" interval={0} height={X_AXIS_HEIGHT} tickLine={false} axisLine={false} tick={<ModuleTick />} />
              <YAxis domain={[0, 100]} hide={isMobile} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={Y_AXIS_WIDTH} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }} />
              {!isMobile && <Tooltip content={<BarTooltip series={series} />} cursor={false} isAnimationActive={false} />}
              {series.map((k, i) => (
                <Bar
                  key={k}
                  dataKey={k}
                  fill={`url(#${gradientId}-${k})`}
                  shape={(p: { x?: number; y?: number; width?: number; height?: number; fill?: string; payload?: Row }) => <ScoreColumn {...p} empty={p.payload?.hasData === false} words={i === 0} />}
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

      {!allEmpty && rows.length > 0 && <ModuleTiles rows={rows} series={series} onOpenModule={onOpenModule} />}

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
