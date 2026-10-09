import { memo, useMemo } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, ClipboardCheck, Ticket as TicketIcon, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scores } from '../../api/scores';
import { SERIES_COLOR, SERIES_LABEL, numbersFor, seriesFor, type ModuleKey, type ScoreMetric, type SeriesKey } from './scoreMetrics';

const MODULES: { key: ModuleKey; name: string; icon: LucideIcon }[] = [
  { key: 'checklist', name: 'Checklist', icon: ClipboardCheck },
  { key: 'ticket', name: 'Tickets', icon: TicketIcon },
  { key: 'delegation', name: 'Delegations', icon: Users },
];

interface Row {
  key: ModuleKey;
  name: string;
  icon: LucideIcon;
  completion: number | null;
  compliance: number | null;
  ontime: number | null;
  hasData: boolean;
}

const rowsFor = (s: Scores): Row[] =>
  MODULES.map(({ key, name, icon }) => {
    const n = numbersFor(s, key);
    return { key, name, icon, completion: n.completion, compliance: n.compliance, ontime: n.ontime, hasData: n.hasData };
  });

const delta = (now: number | null, before: number | null) => (now === null || before === null ? null : now - before);

// The number's colour follows how it is going, the bar keeps the measure's own colour.
const valueTone = (v: number | null) => (v === null ? 'text-text-light' : v >= 80 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-danger');

// One measure of one module: its name, the number, a change since last period and a bar on a fixed 0 to 100
// scale. With nothing to show it is a dash and an empty, outlined track, never a zero bar.
const Measure = ({ series, value, change }: { series: SeriesKey; value: number | null; change: number | null }) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-muted">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SERIES_COLOR[series] }} />
        {SERIES_LABEL[series]}
      </span>
      {change !== null && change !== 0 && (
        <span className={cn('inline-flex items-center t-meta font-display font-bold tabular-nums', change > 0 ? 'text-success' : 'text-danger')} title="Since last period">
          {change > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
          {Math.abs(change)}
        </span>
      )}
    </div>
    <p className={cn('font-display text-2xl font-bold leading-none tabular-nums', valueTone(value))}>{value === null ? '–' : `${value}%`}</p>
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full', value === null ? 'border border-border-hover/70 bg-transparent' : 'bg-border/60')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-label={`${SERIES_LABEL[series]}${value === null ? ': nothing due' : ''}`}
    >
      {value !== null && (
        <div
          className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: SERIES_COLOR[series] }}
        />
      )}
    </div>
  </div>
);

interface ScoreBarsProps {
  scores: Scores | undefined;
  loading: boolean;
  /** Which measure(s) to show: Overview is completion beside compliance, the others one on their own. */
  metric?: ScoreMetric;
  /** The window before this one. When given, the change since then shows beside each number. */
  previous?: Scores | undefined;
  /** Opens that module's late items. Left out where there is no list to open. */
  onOpenModule?: (module: ModuleKey) => void;
}

/**
 * The score card's main view: one row per module (Checklist, Tickets, Delegations) with its measures side by
 * side, each a number over a thin bar on the same 0 to 100 scale. It replaces a column chart that was mostly
 * empty space and gave a bar for work that was never due.
 */
export const ScoreBars = memo(({ scores, loading, metric = 'overview', previous, onOpenModule }: ScoreBarsProps) => {
  const rows = useMemo(() => (scores ? rowsFor(scores) : []), [scores]);
  const before = useMemo(() => (previous ? rowsFor(previous) : null), [previous]);
  const series = seriesFor(metric);

  const summary = rows
    .map((r) => `${r.name}: ${r.hasData ? series.map((k) => `${SERIES_LABEL[k].toLowerCase()} ${r[k] ?? 'no data'}%`).join(', ') : 'nothing due'}`)
    .join('. ');

  if (loading && !scores) {
    return (
      <div className="flex flex-col gap-2.5" role="status" aria-label="Loading scores">
        {MODULES.map((m) => (
          <div key={m.key} className="h-[7.5rem] animate-pulse rounded-xl border border-border/60 bg-surface-hover/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5" role="group" aria-label={summary || 'Scores'}>
      {rows.map((row, i) => {
        const Icon = row.icon;
        const inner = (
          <>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-700 ring-1 ring-primary-500/15 dark:text-primary-300">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="t-card flex-1 truncate font-display font-semibold text-text">{row.name}</span>
              {onOpenModule && <ChevronRight className="size-4 shrink-0 text-text-light transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />}
            </div>
            <div className={cn('grid gap-x-5 gap-y-3', series.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
              {series.map((k) => (
                <Measure key={k} series={k} value={row.hasData ? row[k] : null} change={before ? delta(row[k], before[i][k]) : null} />
              ))}
            </div>
          </>
        );
        const cardClass = 'group flex flex-col gap-3 rounded-xl border border-border/60 bg-surface-hover/20 p-3 text-left sm:p-4';
        return onOpenModule ? (
          <button
            key={row.key}
            type="button"
            onClick={() => onOpenModule(row.key)}
            aria-label={`${row.name}: open the late items`}
            className={cn(cardClass, 'cursor-pointer transition-colors duration-150 hover:border-primary-400/60 hover:bg-primary-500/5 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}
          >
            {inner}
          </button>
        ) : (
          <div key={row.key} className={cardClass}>{inner}</div>
        );
      })}
    </div>
  );
});
ScoreBars.displayName = 'ScoreBars';
