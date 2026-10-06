import { memo, useId, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useIsMobile } from '../../lib/useMediaQuery';
import type { Scores } from '../../api/scores';

// The two measures every module is judged on.
const COMPLETION_COLOR = 'var(--color-primary-600)';
const COMPLIANCE_COLOR = 'var(--color-coral-500)';
// The line the bars are read against; the same 80% cut-off the Good / Fair / Low pills use.
const TARGET = 80;

interface Row {
  name: string;
  completion: number | null;
  compliance: number | null;
  completionNote: string;
  complianceNote: string;
  hasData: boolean;
}

const rowsFor = (s: Scores): Row[] => [
  {
    name: 'Checklist',
    completion: s.checklist.completionPct,
    // Compliance is how well the checked answers were answered, not a count of on-time runs.
    compliance: s.checklist.compliancePct,
    completionNote: `${s.checklist.completed} of ${s.checklist.due} runs finished`,
    complianceNote: s.checklist.compliancePct === null ? 'No answers checked yet' : 'Checked answers that passed',
    hasData: s.checklist.due > 0,
  },
  {
    name: 'Tickets',
    completion: s.ticket.completionPct,
    compliance: s.ticket.compliancePct,
    completionNote: `${s.ticket.closed} of ${s.ticket.due} closed`,
    complianceNote: `${s.ticket.onTime} of ${s.ticket.due} closed on time`,
    hasData: s.ticket.due > 0,
  },
  {
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
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-display font-semibold text-text-secondary">
    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: COMPLETION_COLOR }} />Completion: done of what was due</span>
    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: COMPLIANCE_COLOR }} />Compliance: done on time</span>
  </div>
);

/**
 * Completion and compliance for Checklist, Tickets and Delegations as grouped bars on a fixed 0 to 100
 * scale, so bars from different windows and people can be compared by eye.
 */
export const ScoreBars = memo(({ scores, loading }: { scores: Scores | undefined; loading: boolean }) => {
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
      <div className="relative h-60 sm:h-72 w-full" role="img" aria-label={summary || 'Loading scores'}>
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
            <BarChart data={rows} accessibilityLayer={false} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={4}>
              <defs>
                <linearGradient id={`${gradientId}-a`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COMPLETION_COLOR} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={COMPLETION_COLOR} stopOpacity={1} />
                </linearGradient>
                <linearGradient id={`${gradientId}-b`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COMPLIANCE_COLOR} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={COMPLIANCE_COLOR} stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" strokeOpacity={0.4} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                dy={8}
                tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600 }}
                tickFormatter={(v: string) => {
                  const row = rows.find((r) => r.name === v);
                  return row && !row.hasData ? `${v} (none due)` : v;
                }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tickLine={false}
                axisLine={false}
                width={isMobile ? 36 : 42}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }}
              />
              <ReferenceLine y={TARGET} stroke="var(--color-text-light)" strokeDasharray="5 4" strokeOpacity={0.7} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--color-surface-hover)', fillOpacity: 0.5 }} isAnimationActive={false} />
              <Bar
                dataKey="completion"
                fill={`url(#${gradientId}-a)`}
                radius={[6, 6, 0, 0]}
                maxBarSize={isMobile ? 26 : 44}
                background={{ fill: 'var(--color-surface-hover)', radius: 6 }}
                animationDuration={500}
              >
                <LabelList dataKey="completion" position="top" fontSize={12} fontWeight={700} fill="var(--color-text)" formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : '')} />
              </Bar>
              <Bar
                dataKey="compliance"
                fill={`url(#${gradientId}-b)`}
                radius={[6, 6, 0, 0]}
                maxBarSize={isMobile ? 26 : 44}
                background={{ fill: 'var(--color-surface-hover)', radius: 6 }}
                animationDuration={500}
              >
                <LabelList dataKey="compliance" position="top" fontSize={12} fontWeight={700} fill="var(--color-text)" formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : '')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <span className="pointer-events-none absolute right-2 top-0 text-xs font-display font-semibold text-text-muted">Target {TARGET}%</span>
      </div>

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
