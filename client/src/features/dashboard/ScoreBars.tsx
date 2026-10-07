import { memo, useMemo } from 'react';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scores } from '../../api/scores';
import { SERIES_COLOR, SERIES_HELP, SERIES_LABEL, numbersFor, seriesFor, type ModuleKey, type ScoreMetric, type SeriesKey } from './scoreMetrics';

// The lane behind every bar shows how far from 100% it is.
const LANE = 'color-mix(in oklab, var(--color-primary-500) 10%, transparent)';

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

const delta = (now: number | null, before: number | null) => (now === null || before === null ? null : now - before);

const Delta = ({ value, label }: { value: number | null; label: string }) =>
  value === null || value === 0 ? null : (
    <span className={cn('inline-flex w-9 shrink-0 items-center gap-0.5 text-xs font-display font-bold tabular-nums', value > 0 ? 'text-success' : 'text-danger')} title={`${label}: ${value > 0 ? 'up' : 'down'} ${Math.abs(value)} since the previous period`}>
      {value > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
      {Math.abs(value)}
    </span>
  );

const Legend = ({ series }: { series: SeriesKey[] }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs font-semibold text-text-secondary">
    {series.map((k) => (
      <span key={k} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_COLOR[k] }} />{SERIES_LABEL[k]}</span>
    ))}
    <span className="font-medium text-text-muted">{series.length === 1 ? SERIES_HELP[series[0]] : 'Done of what was due, and done on time'}</span>
  </div>
);

interface ScoreBarsProps {
  scores: Scores | undefined;
  loading: boolean;
  /** Which measure(s) to draw: Overview is completion beside compliance, the others one on their own. */
  metric?: ScoreMetric;
  /** The window before this one. When given, the change since then sits beside each number. */
  previous?: Scores | undefined;
  /** Tapping a row opens that module's late items. Left out where there is no list to open. */
  onOpenModule?: (module: ModuleKey) => void;
}

/**
 * Completion, compliance and on-time rate for Checklist, Tickets and Delegations as one slim row per module:
 * the name and its counts on the left, a bar per measure on the right. Three rows are about 150px tall on any
 * screen, nothing needs an axis, and a module with nothing due is a short quiet row, not a blank column.
 */
export const ScoreBars = memo(({ scores, loading, metric = 'overview', previous, onOpenModule }: ScoreBarsProps) => {
  const rows = useMemo(() => (scores ? rowsFor(scores) : []), [scores]);
  const before = useMemo(() => (previous ? rowsFor(previous) : []), [previous]);
  const series = seriesFor(metric);

  const summary = rows
    .map((r) => `${r.name}: ${r.hasData ? series.map((k) => `${SERIES_LABEL[k].toLowerCase()} ${r[k] ?? 'no data'}%`).join(', ') : 'nothing due'}`)
    .join('. ');

  return (
    <div className="flex flex-col gap-2.5">
      <Legend series={series} />

      {loading && !scores ? (
        <div className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60" role="status" aria-label="Loading scores">
          {MODULES.map((m) => (
            <div key={m.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 px-3 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
              <div className="h-3 w-16 animate-pulse rounded bg-surface-hover" />
              <div className="h-2.5 animate-pulse rounded-full bg-surface-hover" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60" aria-label={summary}>
          {rows.map((r, i) => {
            const openable = !!onOpenModule && r.hasData;
            const body = (
              <div className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 px-3 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <div className="min-w-0 text-left">
                  <p className="truncate text-[13px] font-display font-semibold text-text sm:text-sm">{r.name}</p>
                  <p className="truncate text-xs font-medium text-text-muted">{r.hasData ? r.notes[series[0]] : 'Nothing due'}</p>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  {series.map((k) => (
                    <div key={k} className="flex items-center gap-2" title={`${SERIES_LABEL[k]}: ${r.hasData ? r.notes[k] : 'nothing due'}`}>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: LANE }} aria-hidden="true">
                        <span
                          className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                          style={{ width: r.hasData ? `${r[k] ?? 0}%` : '0%', backgroundColor: SERIES_COLOR[k] }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right text-xs font-display font-bold tabular-nums text-text">{r.hasData && r[k] !== null ? `${r[k]}%` : '-'}</span>
                      {previous && <Delta value={delta(r[k], before[i]?.[k] ?? null)} label={SERIES_LABEL[k]} />}
                    </div>
                  ))}
                </div>
              </div>
            );
            return (
              <li key={r.key}>
                {openable ? (
                  <button
                    type="button"
                    onClick={() => onOpenModule?.(r.key)}
                    aria-label={`${r.name}: open the late items`}
                    className="group relative flex w-full items-center rounded-lg pr-6 outline-none transition-colors hover:bg-surface-hover/40 focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    {body}
                    <ChevronRight className="absolute right-2 size-4 text-text-light opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-60" aria-hidden="true" />
                  </button>
                ) : body}
              </li>
            );
          })}
        </ul>
      )}

      {onOpenModule && <p className="text-xs font-medium text-text-muted">Tap a row to open its late items.</p>}

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
