import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scoreApi, type ScoreReport, type ScoreReportRow, type ScoreScope } from '../../api/scores';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { rateTone, type RateTone } from './dashboardDisplay';
import type { ScoreMetric } from './scoreMetrics';

type Metric = 'overview' | 'completion' | 'compliance' | 'ontime';
type SortKey = 'name' | 'overall' | 'checklist' | 'ticket' | 'delegation';

const METRIC_LABEL: Record<Metric, string> = { overview: 'Overall score', completion: 'Completion', compliance: 'Compliance', ontime: 'On time' };
const SUBJECT: Record<ScoreScope, string> = { org: 'departments', person: 'people', department: 'departments', store: 'stores' };
const SUBJECT_ONE: Record<ScoreScope, string> = { org: 'department', person: 'person', department: 'department', store: 'store' };
const BAR: Record<RateTone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-text-light' };
const TEXT: Record<RateTone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-text-muted' };

interface Computed {
  row: ScoreReportRow;
  completion: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  compliance: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  ontime: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  /** The overall score: completion and compliance counted equally, per module and across them all. */
  overview: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
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
  const avg = (values: (number | null)[]) => {
    const real = values.filter((v): v is number => v !== null);
    return real.length ? Math.round(real.reduce((a, b) => a + b, 0) / real.length) : null;
  };
  const moduleScore = (p: (typeof parts)[number]) => (p.due > 0 ? avg([p.completion, p.compliance]) : null);
  const live = parts.filter((p) => p.due > 0);
  return {
    row,
    due,
    overview: {
      overall: avg(live.flatMap((p) => [p.completion, p.compliance])),
      checklist: moduleScore(parts[0]),
      ticket: moduleScore(parts[1]),
      delegation: moduleScore(parts[2]),
    },
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
  /** The list sits in a narrow side panel: always use the compact cards, never the wide table. */
  compact?: boolean;
  /** When given, the card's measure tabs drive this list and its own measure chips are hidden. */
  metric?: ScoreMetric;
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
export const ScoreRanking = ({ compact = false, metric: controlled, scope, from, to, onOpen }: ScoreRankingProps) => {
  const [localMetric, setMetric] = useState<Metric>('completion');
  const metric: Metric = controlled ?? localMetric;
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [ascending, setAscending] = useState(true);

  const { data, isPending, isError, refetch } = useQuery<ScoreReport>({
    queryKey: ['scores', 'ranking', scope === 'store' ? 'store' : 'people', from, to],
    queryFn: () => scoreApi.report({ from, to, stores: scope === 'store' }),
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    // The whole-organisation view lists its departments.
    const source = scope === 'person' ? data?.people : scope === 'department' || scope === 'org' ? data?.departments : data?.stores;
    const needle = query.trim().toLowerCase();
    const list = (source ?? [])
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.department.toLowerCase().includes(needle))
      .map(compute);
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
  }, [data, scope, metric, sortKey, ascending, query]);

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
    return <InlineError message="Couldn't load the ranking." onRetry={() => void refetch()} />;
  }
  if (rows.length === 0 && !query.trim()) {
    return <div className="rounded-lg border border-border px-4 py-8 text-center text-sm font-medium text-text-muted">Nothing was due for any of the {SUBJECT[scope]} in this window.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Measure" className={cn('inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface-hover/50 p-0.5', controlled && 'hidden')}>
          {(['completion', 'compliance', 'ontime'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                'min-h-8 rounded-full px-3 text-xs font-display font-medium sm:font-bold outline-none transition-colors pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-primary-500/40',
                metric === m ? 'bg-surface text-primary-700 ring-1 ring-border dark:text-primary-300' : 'text-text-muted hover:text-text',
              )}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="t-meta font-medium text-text-muted">{rows.length} {rows.length === 1 ? SUBJECT_ONE[scope] : SUBJECT[scope]}, worst first</p>
      </div>

      <label className="relative block">
        <span className="sr-only">Search {SUBJECT[scope]}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-light" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${SUBJECT[scope]}`}
          className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-base text-text outline-none transition-colors placeholder:text-text-light focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:text-sm"
        />
      </label>

      {rows.length === 0 && <p className="rounded-lg border border-border px-4 py-6 text-center text-sm font-medium text-text-muted">No {SUBJECT[scope]} match &ldquo;{query.trim()}&rdquo;.</p>}

      {/* Phone: one card per row. */}
      <ul className={cn('flex flex-col gap-2', !compact && 'sm:hidden')}>
        {rows.map((c) => {
          const value = c[metric].overall;
          return (
            <li key={c.row.id}>
              <button
                type="button"
                onClick={() => onOpen(c.row.id)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface-hover/30 p-3 text-left outline-none transition-colors hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="flex items-center gap-2.5">
                    {scope === 'person' && (
                      <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold text-white', avatarColorClass(c.row.name))}>{getInitials(c.row.name)}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-display font-semibold text-text">{c.row.name}</span>
                      {scope === 'person' && c.row.department && <span className="block truncate t-meta text-text-muted">{c.row.department}</span>}
                    </span>
                    <span className="text-lg font-display font-extrabold"><Pct value={value} /></span>
                    <ChevronRight className="size-4 shrink-0 text-text-light" aria-hidden="true" />
                  </span>
                  <MiniBar value={value} />
                  <span className="grid grid-cols-3 gap-2 t-meta font-display text-text-muted">
                    <span className="flex flex-col">Checklist<Pct value={c[metric].checklist} /></span>
                    <span className="flex flex-col">Tickets<Pct value={c[metric].ticket} /></span>
                    <span className="flex flex-col">Delegations<Pct value={c[metric].delegation} /></span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Tablet and desktop: a sortable table. */}
      <div className={cn('hidden overflow-x-auto rounded-lg border border-border', !compact && 'sm:block')}>
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
      <p className="hidden t-meta font-medium text-text-muted sm:block">
        {metric === 'overview' ? 'Overall score: completion and compliance counted equally.' : 'Big figure: all three together.'}
      </p>
    </div>
  );
};
