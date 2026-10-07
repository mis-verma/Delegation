import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scoreApi, type ScoreReport, type ScoreReportRow, type ScoreScope } from '../../api/scores';
import { Skeleton } from '../../components/skeleton';
import { rateTone, type RateTone } from './dashboardDisplay';

type Metric = 'completion' | 'compliance' | 'ontime';
type SortKey = 'name' | 'overall' | 'checklist' | 'ticket' | 'delegation';

const METRIC_LABEL: Record<Metric, string> = { completion: 'Completion', compliance: 'Compliance', ontime: 'On time' };
const SUBJECT: Record<ScoreScope, string> = { person: 'people', department: 'departments', store: 'stores' };
const BAR: Record<RateTone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-text-light' };
const TEXT: Record<RateTone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-text-muted' };

interface Computed {
  row: ScoreReportRow;
  completion: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  compliance: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  ontime: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  due: number;
}

// Overall is weighted by how much each module had due, so a module with 2 items does not count like one
// with 200. Compliance is averaged the same way over the modules that have a compliance figure.
const compute = (row: ScoreReportRow): Computed => {
  const parts = [
    { due: row.checklist.due, done: row.checklist.completed, completion: row.checklist.completionPct, compliance: row.checklist.compliancePct, ontime: row.checklist.onTimePct, onTime: row.checklist.onTime },
    { due: row.ticket.due, done: row.ticket.closed, completion: row.ticket.completionPct, compliance: row.ticket.compliancePct, ontime: row.ticket.onTimePct, onTime: row.ticket.onTime },
    { due: row.delegation.due, done: row.delegation.done, completion: row.delegation.completionPct, compliance: row.delegation.compliancePct, ontime: row.delegation.onTimePct, onTime: row.delegation.onTime },
  ];
  const due = parts.reduce((s, p) => s + p.due, 0);
  const done = parts.reduce((s, p) => s + p.done, 0);
  const withCompliance = parts.filter((p) => p.compliance !== null && p.due > 0);
  const complianceDue = withCompliance.reduce((s, p) => s + p.due, 0);
  const overallCompliance = complianceDue ? Math.round(withCompliance.reduce((s, p) => s + (p.compliance as number) * p.due, 0) / complianceDue) : null;
  return {
    row,
    due,
    completion: { overall: due ? Math.round((done / due) * 100) : null, checklist: parts[0].completion, ticket: parts[1].completion, delegation: parts[2].completion },
    compliance: { overall: overallCompliance, checklist: parts[0].compliance, ticket: parts[1].compliance, delegation: parts[2].compliance },
    // Overall on time: of everything finished, how much was finished on time.
    ontime: { overall: done ? Math.round((parts.reduce((s, p) => s + p.onTime, 0) / done) * 100) : null, checklist: parts[0].ontime, ticket: parts[1].ontime, delegation: parts[2].ontime },
  };
};

const Pct = ({ value }: { value: number | null }) =>
  value === null ? <span className="text-text-light">-</span> : <span className={cn('tabular-nums font-bold', TEXT[rateTone(value, Number.MAX_SAFE_INTEGER)])}>{value}%</span>;

const MiniBar = ({ value }: { value: number | null }) => (
  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
    {value !== null && <span className={cn('block h-full rounded-full transition-[width] duration-500', BAR[rateTone(value, Number.MAX_SAFE_INTEGER)])} style={{ width: `${value}%` }} />}
  </span>
);

interface ScoreRankingProps {
  scope: ScoreScope;
  from: string;
  to: string;
  /** Open one row on the card: the dials and bars for that person, department or store. */
  onOpen: (id: string) => void;
}

/**
 * Everyone (or every department, or every store) side by side for the selected window, sorted so the
 * ones who need attention are on top. Tap a row to open that person, department or store on the card.
 */
export const ScoreRanking = ({ scope, from, to, onOpen }: ScoreRankingProps) => {
  const [metric, setMetric] = useState<Metric>('completion');
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [ascending, setAscending] = useState(true);

  const { data, isPending, isError, refetch } = useQuery<ScoreReport>({
    queryKey: ['scores', 'ranking', scope === 'store' ? 'store' : 'people', from, to],
    queryFn: () => scoreApi.report({ from, to, stores: scope === 'store' }),
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const source = scope === 'person' ? data?.people : scope === 'department' ? data?.departments : data?.stores;
    const list = (source ?? []).map(compute);
    const value = (c: Computed): number | string | null => {
      if (sortKey === 'name') return c.row.name.toLowerCase();
      return c[metric][sortKey];
    };
    return [...list].sort((a, b) => {
      const x = value(a), y = value(b);
      // Rows with no figure always sink to the bottom, whichever way the list is sorted.
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const diff = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
      return ascending ? diff : -diff;
    });
  }, [data, scope, metric, sortKey, ascending]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAscending((v) => !v);
    else { setSortKey(key); setAscending(key === 'name'); }
  };

  const heads: { key: SortKey; label: string }[] = [
    { key: 'overall', label: 'Overall' },
    { key: 'checklist', label: 'Checklist' },
    { key: 'ticket', label: 'Tickets' },
    { key: 'delegation', label: 'Delegations' },
  ];

  if (isPending) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading the ranking">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-lg border border-border px-4 py-6 text-center text-sm font-medium text-text-muted">
        Could not load the ranking.{' '}
        <button type="button" onClick={() => void refetch()} className="font-bold text-primary-600 hover:underline dark:text-primary-400">Try again</button>
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm font-medium text-text-muted">Nothing was due for any of the {SUBJECT[scope]} in this window.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Measure" className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface-hover/50 p-0.5">
          {(['completion', 'compliance', 'ontime'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                'min-h-8 rounded-full px-3 text-xs font-display font-bold outline-none transition-colors pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-primary-500/40',
                metric === m ? 'bg-surface text-primary-700 ring-1 ring-border dark:text-primary-300' : 'text-text-muted hover:text-text',
              )}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-text-muted">{rows.length} {SUBJECT[scope]}. Worst first. Tap a row to open it.</p>
      </div>

      {/* Phone: one card per row. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((c) => {
          const value = c[metric].overall;
          return (
            <li key={c.row.id}>
              <button
                type="button"
                onClick={() => onOpen(c.row.id)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface-hover/30 p-3 text-left outline-none transition-colors hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate text-sm font-display font-bold text-text">{c.row.name}</span>
                  <MiniBar value={value} />
                  <span className="flex flex-wrap gap-x-3 text-xs font-display font-medium text-text-muted">
                    <span>Checklist <Pct value={c[metric].checklist} /></span>
                    <span>Tickets <Pct value={c[metric].ticket} /></span>
                    <span>Delegations <Pct value={c[metric].delegation} /></span>
                  </span>
                </span>
                <span className="text-lg font-display font-extrabold"><Pct value={value} /></span>
                <ChevronRight className="size-4 shrink-0 text-text-light" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Tablet and desktop: a sortable table. */}
      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{METRIC_LABEL[metric]} by {scope}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-hover/40">
              <th scope="col" aria-sort={sortKey === 'name' ? (ascending ? 'ascending' : 'descending') : 'none'} className="px-3 py-2">
                <button type="button" onClick={() => sortBy('name')} className="inline-flex min-h-8 items-center gap-1 text-xs font-display font-bold text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
                  Name {sortKey === 'name' && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                </button>
              </th>
              {heads.map((h) => (
                <th key={h.key} scope="col" aria-sort={sortKey === h.key ? (ascending ? 'ascending' : 'descending') : 'none'} className="min-w-28 px-3 py-2">
                  <button type="button" onClick={() => sortBy(h.key)} className="inline-flex min-h-8 items-center gap-1 text-xs font-display font-bold text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
                    {h.label} {sortKey === h.key && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                  </button>
                </th>
              ))}
              <th scope="col" className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.row.id} className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-hover/40" onClick={() => onOpen(c.row.id)}>
                <th scope="row" className="px-3 py-2 font-normal">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(c.row.id); }} className="flex min-h-10 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
                    <span className="text-sm font-display font-bold text-text">{c.row.name}</span>
                    {c.row.department && scope === 'person' && <span className="text-xs font-medium text-text-muted">{c.row.department}</span>}
                  </button>
                </th>
                {heads.map((h) => (
                  <td key={h.key} className="px-3 py-2">
                    <span className="flex flex-col gap-1">
                      <span className={cn('text-sm', h.key === 'overall' && 'font-display text-base')}><Pct value={c[metric][h.key as Exclude<SortKey, 'name'>]} /></span>
                      <MiniBar value={c[metric][h.key as Exclude<SortKey, 'name'>]} />
                    </span>
                  </td>
                ))}
                <td className="pr-3"><ChevronRight className="size-4 text-text-light transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs font-medium text-text-muted">Overall is weighted by how much each module had due. A row with nothing due in a module shows a dash there.</p>
    </div>
  );
};
