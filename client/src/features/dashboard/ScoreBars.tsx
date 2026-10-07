import { memo, useId, useMemo, type ReactElement } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useIsMobile } from '../../lib/useMediaQuery';
import type { Scores } from '../../api/scores';
import { SERIES_COLOR, SERIES_HELP, SERIES_LABEL, numbersFor, seriesFor, type ModuleKey, type ScoreMetric, type SeriesKey } from './scoreMetrics';

// A soft blue lane behind every bar shows how far from 100% it is, with no gridlines needed.
const TRACK_FILL = 'color-mix(in oklab, var(--color-primary-500) 9%, transparent)';

const MODULES: { key: ModuleKey; name: string }[] = [
  { key: 'checklist', name: 'Checklist' },
  { key: 'ticket', name: 'Tickets' },
  { key: 'delegation', name: 'Delegations' },
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
      <p className="text-sm font-display font-bold text-text">{row.name}</p>
      {row.hasData ? (
        series.map((k) => (
          <div key={k} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: SERIES_COLOR[k] }} />
            <div className="min-w-0">
              <p className="text-xs font-display font-bold text-text">{SERIES_LABEL[k]} {row[k] === null ? 'no data' : `${row[k]}%`}</p>
              <p className="text-xs font-display text-text-muted">{row.notes[k]}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-xs font-display text-text-muted">Nothing was due in this window.</p>
      )}
    </div>
  );
};

const Legend = ({ series }: { series: SeriesKey[] }) => (
  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-bold text-text-secondary">
    {series.map((k) => (
      <span key={k} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_COLOR[k] }} />{SERIES_LABEL[k]}</span>
    ))}
    <span className="font-medium text-text-muted">{series.length === 1 ? SERIES_HELP[series[0]] : 'Done of what was due, and done on time'}</span>
  </div>
);

// Module name with a quiet second line when nothing was due, so a missing bar is explained in place.
const ModuleTick = ({ x, y, payload, rows }: { x?: number; y?: number; payload?: { value: string }; rows: Row[] }) => {
  const name = payload?.value ?? '';
  const empty = rows.find((r) => r.name === name)?.hasData === false;
  return (
    <g transform={`translate(${x ?? 0},${(y ?? 0) + 6})`}>
      <text textAnchor="middle" dy={12} fill="var(--color-text-secondary)" fontSize={12} fontWeight={700}>{name}</text>
      {empty && <text textAnchor="middle" dy={28} fill="var(--color-text-muted)" fontSize={12} fontWeight={500}>Nothing due</text>}
    </g>
  );
};

interface ScoreBarsProps {
  scores: Scores | undefined;
  loading: boolean;
  /** Which measure(s) to draw: Overview is completion beside compliance, the others one on their own. */
  metric?: ScoreMetric;
  /** The window before this one. When given, the change since then is shown under the chart. */
  previous?: Scores | undefined;
  /** Tapping a bar opens that module's late items. Left out where there is no list to open. */
  onOpenModule?: (module: ModuleKey) => void;
}

const delta = (now: number | null, before: number | null) => (now === null || before === null ? null : now - before);

const Delta = ({ label, value }: { label: string; value: number | null }) =>
  value === null ? (
    <span className="text-xs font-medium text-text-muted">{label} -</span>
  ) : (
    <span className={`inline-flex items-center gap-0.5 text-xs font-display font-bold tabular-nums ${value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-muted'}`}>
      <span className="font-medium text-text-muted">{label}</span>
      {value > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : value < 0 ? <ArrowDown className="size-3" aria-hidden="true" /> : null}
      {value === 0 ? 'same' : `${Math.abs(value)}`}
    </span>
  );

/**
 * Completion, compliance and on-time rate for Checklist, Tickets and Delegations as bars on a fixed 0 to
 * 100 scale, so bars from different windows and people can be compared by eye.
 */
export const ScoreBars = memo(({ scores, loading, metric = 'overview', previous, onOpenModule }: ScoreBarsProps) => {
  const isMobile = useIsMobile();
  const gradientId = useId().replace(/:/g, '');
  const rows = useMemo(() => (scores ? rowsFor(scores) : []), [scores]);
  const series = seriesFor(metric);
  // One bar per module is allowed to be wider than a pair.
  const barSize = series.length === 1 ? (isMobile ? 56 : 72) : isMobile ? 40 : 52;
  // A module with nothing due is drawn as zero so its empty lane still shows in the row; its number is not printed.
  const chartRows = useMemo(() => rows.map((r) => (r.hasData ? r : { ...r, completion: 0, compliance: 0, ontime: 0 })), [rows]);
  const renderLabel = (props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown; index?: number }): ReactElement | null => {
    const row = chartRows[props.index ?? -1];
    if (!row?.hasData || typeof props.value !== 'number') return null;
    return (
      <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-text)">
        {props.value}%
      </text>
    );
  };

  const summary = rows
    .map((r) => `${r.name}: ${r.hasData ? series.map((k) => `${SERIES_LABEL[k].toLowerCase()} ${r[k] ?? 'no data'}%`).join(', ') : 'nothing due'}`)
    .join('. ');

  return (
    <div className="flex flex-col gap-3">
      <Legend series={series} />

      {/* The height is fixed so the card does not jump while the numbers load or the window changes. */}
      <div className={`relative h-56 sm:h-64 w-full ${onOpenModule ? '[&_.recharts-bar-rectangle]:cursor-pointer' : ''}`} role="img" aria-label={summary || 'Loading scores'}>
        {loading && !scores ? (
          <div className="absolute inset-0 flex items-end justify-around gap-4 px-6 pb-8" role="status" aria-label="Loading scores">
            {[55, 80, 40].map((h, i) => (
              <div key={i} className="flex flex-1 items-end justify-center gap-2">
                <div className="w-6 sm:w-8 rounded-t-md bg-surface-hover animate-pulse" style={{ height: `${h}%` }} />
                {series.length > 1 && <div className="w-6 sm:w-8 rounded-t-md bg-surface-hover animate-pulse" style={{ height: `${Math.max(20, h - 15)}%` }} />}
              </div>
            ))}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} accessibilityLayer={false} margin={{ top: 22, right: 4, left: isMobile ? 0 : 4, bottom: 0 }} barCategoryGap={isMobile ? '10%' : '24%'} barGap={6}>
              <defs>
                {series.map((k) => (
                  <linearGradient key={k} id={`${gradientId}-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES_COLOR[k]} stopOpacity={0.82} />
                    <stop offset="100%" stopColor={SERIES_COLOR[k]} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              {/* Every module is always listed: interval 0 stops the axis from dropping labels on a narrow card. */}
              <XAxis dataKey="name" interval={0} height={44} tickLine={false} axisLine={false} tick={<ModuleTick rows={rows} />} />
              {/* The scale lives in the lanes behind the bars and the numbers on top, so a phone gives the
                  width to the bars instead of an axis. */}
              <YAxis domain={[0, 100]} hide={isMobile} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={44} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }} />
              <Tooltip content={<BarTooltip series={series} />} cursor={false} isAnimationActive={false} />
              {series.map((k) => (
                <Bar
                  key={k}
                  dataKey={k}
                  fill={`url(#${gradientId}-${k})`}
                  radius={[7, 7, 0, 0]}
                  maxBarSize={barSize}
                  background={{ fill: TRACK_FILL, radius: 7 }}
                  animationDuration={500}
                  onClick={(d: { payload?: Row }) => { if (d.payload) onOpenModule?.(d.payload.key); }}
                >
                  <LabelList dataKey={k} position="top" offset={6} content={renderLabel} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {previous && scores && (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-surface-hover/30 px-3 py-2.5" aria-label="Change since the previous period">
          <li className="text-xs font-display font-bold text-text-secondary">Since the previous period</li>
          {rowsFor(scores).map((r, i) => {
            const before = rowsFor(previous)[i];
            return (
              <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                <span className="w-24 text-xs font-display font-bold text-text">{r.name}</span>
                {series.map((k) => <Delta key={k} label={SERIES_LABEL[k]} value={delta(r[k], before[k])} />)}
              </li>
            );
          })}
        </ul>
      )}
      {onOpenModule && <p className="text-xs font-medium text-text-muted">Tap a bar to open the late items for that module.</p>}

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
