import { memo, useId, useMemo, type ReactElement } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useIsMobile } from '../../lib/useMediaQuery';
import { ScoreColumn } from './scoreBarShape';
import type { Scores } from '../../api/scores';
import { formatPct } from '../../lib/percent';
import { MODULE_LABEL } from '../../lib/scoreLabels';
import { SeriesLegend } from './SeriesLegend';
import { SERIES_COLOR, SERIES_LABEL, numbersFor, seriesFor, type ModuleKey, type ScoreMetric, type SeriesKey } from './scoreMetrics';

// A faint lane behind every bar shows how far from 100% it is.
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

// Just the module name. A module with nothing due is shown by its empty outlined bar, not by extra words.
const ModuleTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => (
  <g transform={`translate(${x ?? 0},${(y ?? 0) + 6})`}>
    <text textAnchor="middle" dy={12} fill="var(--color-text-secondary)" fontSize={12} fontWeight={700}>{payload?.value ?? ''}</text>
  </g>
);

interface ScoreBarsProps {
  scores: Scores | undefined;
  loading: boolean;
  /** Which measure(s) to draw: Overview is completion beside compliance, the others one on their own. */
  metric?: ScoreMetric;
  /** The window before this one. When given, the change since then is shown under the chart. */
  previous?: Scores | undefined;
  /** Tapping a bar opens that module's late items. Left out where there is no list to open. */
  onOpenModule?: (module: ModuleKey) => void;
  /** Phone only: when no module had anything due, this one line replaces three blank columns. */
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

/**
 * Completion, compliance and on-time rate for Checklist, Tickets and Delegations as bars on a fixed 0 to
 * 100 scale, so bars from different windows and people can be compared by eye.
 */
// Chart margins and axis room, shared by the chart and its loading skeleton so the skeleton's bars
// stand exactly where the real ones will.
const CHART_TOP = 22;
const X_AXIS_HEIGHT = 30;
const Y_AXIS_WIDTH = 44;
const BAR_GAP = 6;

export const ScoreBars = memo(({ scores, loading, metric = 'overview', previous, onOpenModule, emptyText = 'Nothing due yet' }: ScoreBarsProps) => {
  const isMobile = useIsMobile();
  const gradientId = useId().replace(/:/g, '');
  const rows = useMemo(() => (scores ? rowsFor(scores) : []), [scores]);
  const series = seriesFor(metric);
  // One bar per module is allowed to be wider than a pair.
  const barSize = series.length === 1 ? (isMobile ? 64 : 96) : isMobile ? 44 : 64;
  // A module with nothing due is given a full-height value so its soft "Nothing due" column fills the lane; its number is not printed.
  const chartRows = useMemo(() => rows.map((r) => (r.hasData ? r : { ...r, completion: 100, compliance: 100, ontime: 100 })), [rows]);
  // A phone with nothing due anywhere gets one plain line, not three pale columns.
  const allEmpty = isMobile && rows.length > 0 && rows.every((r) => !r.hasData);
  const renderLabel = (props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown; index?: number }): ReactElement | null => {
    const row = chartRows[props.index ?? -1];
    if (!row?.hasData || typeof props.value !== 'number') return null;
    // On a phone the figure is the thing to read: bigger and bolder than the 12px module names.
    return (
      <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) - 6} textAnchor="middle" fontSize={isMobile ? 15 : 12} fontWeight={isMobile ? 800 : 700} fill="var(--color-text)">
        {formatPct(props.value)}
      </text>
    );
  };

  const summary = rows
    .map((r) => `${r.name}: ${r.hasData ? series.map((k) => `${SERIES_LABEL[k].toLowerCase()} ${r[k] === null ? 'no data' : formatPct(r[k])}`).join(', ') : 'nothing due'}`)
    .join('. ');

  return (
    <div className="flex flex-col gap-3">
      {/* Phone: just the bars. The legend chips ("Done", "On time or right") are gone there; the card's ? says
          what the bars mean, and each bar still carries its number. Wider screens keep the legend. */}
      {!isMobile && <SeriesLegend series={series} labels={SERIES_LABEL} />}

      {/* The height is fixed so the card does not jump while the numbers load or the window changes. */}
      <div className={`relative h-56 sm:h-64 w-full ${onOpenModule ? '[&_.recharts-bar-rectangle]:cursor-pointer' : ''}`} role="img" aria-label={allEmpty ? emptyText : summary || 'Loading scores'}>
        {loading && !scores ? (
          // Same plot area, bar width and gap as the chart below, so the bars grow in place.
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
          <div className="flex h-full items-center justify-center rounded-lg border border-border px-4 text-center t-card font-medium text-text-muted">
            {emptyText}
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
              {/* Every module is always listed: interval 0 stops the axis from dropping labels on a narrow card. */}
              <XAxis dataKey="name" interval={0} height={X_AXIS_HEIGHT} tickLine={false} axisLine={false} tick={<ModuleTick />} />
              {/* The scale lives in the lanes behind the bars and the numbers on top, so a phone gives the
                  width to the bars instead of an axis. */}
              <YAxis domain={[0, 100]} hide={isMobile} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={Y_AXIS_WIDTH} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }} />
              {/* Hover only: on a touch screen a tap opens the module's popup, and a tooltip under it would just repeat it. */}
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
        <ul className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label="Change since the previous period">
          <li className="t-meta font-display font-bold text-text-secondary">Since last period</li>
          {rowsFor(scores).map((r, i) => {
            const before = rowsFor(previous)[i];
            // A module with nothing due in either period has nothing to compare; leave it out.
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
