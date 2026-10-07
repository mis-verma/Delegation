import { memo, useId, useMemo } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useIsMobile } from '../../lib/useMediaQuery';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { Scores } from '../../api/scores';

// The two measures every module is judged on.
// Blue for completion, dark blue for compliance: one hue, two weights, so the pair reads as a unit.
const COMPLETION_COLOR = 'var(--color-primary-500)';
const COMPLIANCE_COLOR = 'var(--color-primary-800)';
// A soft blue lane behind every bar shows how far from 100% it is, with no gridlines needed.
const TRACK_FILL = 'color-mix(in oklab, var(--color-primary-500) 9%, transparent)';

type ModuleKey = 'checklist' | 'ticket' | 'delegation';

interface Row {
  key: ModuleKey;
  name: string;
  completion: number | null;
  compliance: number | null;
  completionNote: string;
  complianceNote: string;
  hasData: boolean;
}

const rowsFor = (s: Scores): Row[] => [
  {
    key: 'checklist',
    name: 'Checklist',
    completion: s.checklist.completionPct,
    // Compliance is how well the checked answers were answered, not a count of on-time runs.
    compliance: s.checklist.compliancePct,
    completionNote: `${s.checklist.completed} of ${s.checklist.due} runs finished`,
    complianceNote: s.checklist.compliancePct === null ? 'No answers checked yet' : 'Checked answers that passed',
    hasData: s.checklist.due > 0,
  },
  {
    key: 'ticket',
    name: 'Tickets',
    completion: s.ticket.completionPct,
    compliance: s.ticket.compliancePct,
    completionNote: `${s.ticket.closed} of ${s.ticket.due} closed`,
    complianceNote: `${s.ticket.onTime} of ${s.ticket.due} closed on time`,
    hasData: s.ticket.due > 0,
  },
  {
    key: 'delegation',
    name: 'Delegations',
    completion: s.delegation.completionPct,
    compliance: s.delegation.compliancePct,
    completionNote: `${s.delegation.done} of ${s.delegation.due} done`,
    complianceNote: `${s.delegation.onTime} of ${s.delegation.due} done on time`,
    hasData: s.delegation.due > 0,
  },
];

interface TooltipPayloadItem { payload?: Row }

const BarTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const line = (label: string, color: string, value: number | null, note: string) => (
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        <p className="text-xs font-display font-bold text-text">{label} {value === null ? 'no data' : `${value}%`}</p>
        <p className="text-xs font-display text-text-muted">{note}</p>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 min-w-44">
      <p className="text-sm font-display font-bold text-text">{row.name}</p>
      {row.hasData ? (
        <>
          {line('Completion', COMPLETION_COLOR, row.completion, row.completionNote)}
          {line('Compliance', COMPLIANCE_COLOR, row.compliance, row.complianceNote)}
        </>
      ) : (
        <p className="text-xs font-display text-text-muted">Nothing was due in this window.</p>
      )}
    </div>
  );
};

const Legend = () => (
  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-bold text-text-secondary">
    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: COMPLETION_COLOR }} />Completion</span>
    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: COMPLIANCE_COLOR }} />Compliance</span>
    <span className="font-medium text-text-muted">Done of what was due, and done on time</span>
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

/**
 * Completion and compliance for Checklist, Tickets and Delegations as grouped bars on a fixed 0 to 100
 * scale, so bars from different windows and people can be compared by eye.
 */
interface ScoreBarsProps {
  scores: Scores | undefined;
  loading: boolean;
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

export const ScoreBars = memo(({ scores, loading, previous, onOpenModule }: ScoreBarsProps) => {
  const isMobile = useIsMobile();
  const gradientId = useId().replace(/:/g, '');
  const rows = useMemo(() => (scores ? rowsFor(scores) : []), [scores]);

  const summary = rows
    .map((r) => `${r.name}: ${r.hasData ? `completion ${r.completion ?? 'no data'}%, compliance ${r.compliance ?? 'no data'}%` : 'nothing due'}`)
    .join('. ');

  return (
    <div className="flex flex-col gap-3">
      <Legend />

      {/* The height is fixed so the card does not jump while the numbers load or the window changes. */}
      <div className={`relative h-60 sm:h-72 w-full ${onOpenModule ? '[&_.recharts-bar-rectangle]:cursor-pointer' : ''}`} role="img" aria-label={summary || 'Loading scores'}>
        {loading && !scores ? (
          <div className="absolute inset-0 flex items-end justify-around gap-4 px-6 pb-8" role="status" aria-label="Loading scores">
            {[55, 80, 40].map((h, i) => (
              <div key={i} className="flex flex-1 items-end justify-center gap-2">
                <div className="w-6 sm:w-8 rounded-t-md bg-surface-hover animate-pulse" style={{ height: `${h}%` }} />
                <div className="w-6 sm:w-8 rounded-t-md bg-surface-hover animate-pulse" style={{ height: `${Math.max(20, h - 15)}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} accessibilityLayer={false} margin={{ top: 22, right: 4, left: isMobile ? 0 : 4, bottom: 0 }} barCategoryGap={isMobile ? '10%' : '24%'} barGap={6}>
              <defs>
                <linearGradient id={`${gradientId}-a`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COMPLETION_COLOR} stopOpacity={0.8} />
                  <stop offset="100%" stopColor={COMPLETION_COLOR} stopOpacity={1} />
                </linearGradient>
                <linearGradient id={`${gradientId}-b`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COMPLIANCE_COLOR} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={COMPLIANCE_COLOR} stopOpacity={1} />
                </linearGradient>
              </defs>
              {/* Every module is always listed: interval 0 stops the axis from dropping labels on a narrow card. */}
              <XAxis dataKey="name" interval={0} height={44} tickLine={false} axisLine={false} tick={<ModuleTick rows={rows} />} />
              {/* The scale lives in the lanes behind the bars and the numbers on top, so a phone gives the
                  width to the bars instead of an axis. */}
              <YAxis domain={[0, 100]} hide={isMobile} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={44} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }} />
              <Tooltip content={<BarTooltip />} cursor={false} isAnimationActive={false} />
              <Bar dataKey="completion" fill={`url(#${gradientId}-a)`} radius={[7, 7, 0, 0]} maxBarSize={isMobile ? 40 : 52} background={{ fill: TRACK_FILL, radius: 7 }} animationDuration={500} onClick={(d: { payload?: Row }) => { if (d.payload) onOpenModule?.(d.payload.key); }}>
                <LabelList dataKey="completion" position="top" offset={6} fontSize={12} fontWeight={700} fill="var(--color-text)" formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : '')} />
              </Bar>
              <Bar dataKey="compliance" fill={`url(#${gradientId}-b)`} radius={[7, 7, 0, 0]} maxBarSize={isMobile ? 40 : 52} background={{ fill: TRACK_FILL, radius: 7 }} animationDuration={500} onClick={(d: { payload?: Row }) => { if (d.payload) onOpenModule?.(d.payload.key); }}>
                <LabelList dataKey="compliance" position="top" offset={6} fontSize={12} fontWeight={700} fill="var(--color-text)" formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : '')} />
              </Bar>
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
                <Delta label="Completion" value={delta(r.completion, before.completion)} />
                <Delta label="Compliance" value={delta(r.compliance, before.compliance)} />
              </li>
            );
          })}
        </ul>
      )}
      {onOpenModule && <p className="text-xs font-medium text-text-muted">Tap a bar to open the late items for that module.</p>}

      <table className="sr-only">
        <caption>Completion and compliance by module</caption>
        <thead><tr><th scope="col">Module</th><th scope="col">Completion</th><th scope="col">Compliance</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}><th scope="row">{r.name}</th><td>{r.completion ?? 'No data'}</td><td>{r.compliance ?? 'No data'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
ScoreBars.displayName = 'ScoreBars';
