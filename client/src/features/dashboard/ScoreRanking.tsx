import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NO_DEPARTMENT_ROW_ID, UNASSIGNED_ROW_ID, type ScoreReportRow, type ScoreScope } from '../../api/scores';
import { useScoreReport, useStoreScoreReport } from './scoreQueries';
import { acrossModules, overallOf } from './scoreMetrics';
import { roundPct } from '../../lib/percent';
import { MODULE_LABEL, SCORE_LABEL, SCORE_LABEL_SHORT } from '../../lib/scoreLabels';
import { SEARCH_INPUT_CLASS } from '../scores/controlStyles';
import { ScorePct } from '../scores/ScorePct';
import { NumCell, SortHead } from '../scores/scoreTableParts';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { ExportMenu } from '../../components/exportMenu';
import { exportTitle, type TableRows } from '../../lib/exportTable';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { rateTone, type RateTone } from './dashboardDisplay';
import type { ScoreMetric } from './scoreMetrics';

type Metric = 'overview' | 'completion' | 'compliance' | 'ontime';
type SortKey = 'name' | 'overall' | 'checklist' | 'ticket' | 'delegation';

const METRIC_LABEL: Record<Metric, string> = { overview: SCORE_LABEL.overall, completion: SCORE_LABEL.completion, compliance: SCORE_LABEL.compliance, ontime: SCORE_LABEL_SHORT.onTime };
const SUBJECT: Record<ScoreScope, string> = { org: 'departments', person: 'people', department: 'departments', store: 'stores' };
const SUBJECT_ONE: Record<ScoreScope, string> = { org: 'department', person: 'person', department: 'department', store: 'store' };
const SUBJECT_HEAD: Record<ScoreScope, string> = { org: 'Department', person: 'Person', department: 'Department', store: 'Store' };
const BAR: Record<RateTone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-text-light' };

interface Computed {
  row: ScoreReportRow;
  completion: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  compliance: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  ontime: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  overview: Record<'overall' | 'checklist' | 'ticket' | 'delegation', number | null>;
  due: number;
}

const compute = (row: ScoreReportRow): Computed => {
  const parts = [
    { due: row.checklist.due, done: row.checklist.completed, completion: row.checklist.completionPct, compliance: row.checklist.compliancePct, ontime: row.checklist.onTimePct, onTime: row.checklist.onTime },
    { due: row.ticket.due, done: row.ticket.closed, completion: row.ticket.completionPct, compliance: row.ticket.compliancePct, ontime: row.ticket.onTimePct, onTime: row.ticket.onTime },
    { due: row.delegation.due, done: row.delegation.done, completion: row.delegation.completionPct, compliance: row.delegation.compliancePct, ontime: row.delegation.onTimePct, onTime: row.delegation.onTime },
  ];
  const across = acrossModules(row);
  const due = across.due;
  const avg = (values: (number | null)[]) => {
    const real = values.filter((v): v is number => v !== null);
    return real.length ? roundPct(real.reduce((a, b) => a + b, 0) / real.length) : null;
  };
  const moduleScore = (p: (typeof parts)[number]) => (p.due > 0 ? avg([p.completion, p.compliance]) : null);
  return {
    row,
    due,
    overview: {
      overall: overallOf(row),
      checklist: moduleScore(parts[0]),
      ticket: moduleScore(parts[1]),
      delegation: moduleScore(parts[2]),
    },
    completion: { overall: across.completion, checklist: parts[0].completion, ticket: parts[1].completion, delegation: parts[2].completion },
    compliance: { overall: across.compliance, checklist: parts[0].compliance, ticket: parts[1].compliance, delegation: parts[2].compliance },
    ontime: { overall: across.ontime, checklist: parts[0].ontime, ticket: parts[1].ontime, delegation: parts[2].ontime },
  };
};

const Pct = ({ value }: { value: number | null }) => <ScorePct value={value} strong />;

const MiniBar = ({ value }: { value: number | null }) => (
  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
    {value !== null && <span className={cn('block h-full rounded-full transition-[width] duration-500', BAR[rateTone(value, Number.MAX_SAFE_INTEGER)])} style={{ width: `${value}%` }} />}
  </span>
);

interface ScoreRankingProps {
  compact?: boolean;
  metric?: ScoreMetric;
  scope: ScoreScope;
  from: string;
  to: string;
  onOpen: (id: string) => void;
}

export const ScoreRanking = ({ compact = false, metric: controlled, scope, from, to, onOpen }: ScoreRankingProps) => {
  const [localMetric, setMetric] = useState<Metric>('completion');
  const metric: Metric = controlled ?? localMetric;
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [ascending, setAscending] = useState(true);

  const isStore = scope === 'store';
  const peopleReport = useScoreReport(from, to, !isStore);
  const storeReport = useStoreScoreReport(from, to, isStore);
  const { data: reportData, isPending, isError, refetch } = isStore ? storeReport : peopleReport;

  const rows = useMemo(() => {
    const source = isStore ? (reportData as ScoreReportRow[] | undefined) : scope === 'person' ? peopleReport.data?.people : peopleReport.data?.departments;
    const needle = query.trim().toLowerCase();
    const list = (source ?? [])
      .filter((r) => r.id !== UNASSIGNED_ROW_ID && r.id !== NO_DEPARTMENT_ROW_ID)
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.department.toLowerCase().includes(needle))
      .map(compute);
    const value = (c: Computed): number | string | null => {
      if (sortKey === 'name') return c.row.name.toLowerCase();
      return c[metric][sortKey];
    };
    return [...list].sort((a, b) => {
      const x = value(a), y = value(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const diff = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
      return ascending ? diff : -diff;
    });
  }, [reportData, peopleReport.data, isStore, scope, metric, sortKey, ascending, query]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAscending((v) => !v);
    else { setSortKey(key); setAscending(key === 'name'); }
  };

  const exportRows = (): TableRows => {
    const measure = metric === 'overview' ? 'overall score' : `${METRIC_LABEL[metric].toLowerCase()} %`;
    const head = ['Position', SUBJECT_HEAD[scope], ...(scope === 'person' ? ['Department'] : []), `All modules ${measure}`, `Checklist ${measure}`, `Tickets ${measure}`, `Delegations ${measure}`, 'Due'];
    return [head, ...rows.map((c, i) => [i + 1, c.row.name, ...(scope === 'person' ? [c.row.department] : []), c[metric].overall, c[metric].checklist, c[metric].ticket, c[metric].delegation, c.due])];
  };

  const orderNote = (() => {
    if (rows.length < 2) return '';
    if (sortKey === 'name') return ascending ? ', A to Z' : ', Z to A';
    const column = sortKey === 'overall' ? 'overall score' : `${MODULE_LABEL[sortKey].toLowerCase()} score`;
    return `, ${ascending ? 'lowest' : 'highest'} ${column} first`;
  })();

  const heads: { key: SortKey; label: string }[] = [
    { key: 'overall', label: 'Overall' },
    { key: 'checklist', label: MODULE_LABEL.checklist },
    { key: 'ticket', label: MODULE_LABEL.ticket },
    { key: 'delegation', label: MODULE_LABEL.delegation },
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
    return <div className="rounded-lg border border-border px-4 py-8 text-center t-card font-medium text-text-muted">Nothing was due for any of the {SUBJECT[scope]} in this window.</div>;
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
                'min-h-8 rounded-full px-3 t-meta font-display font-semibold outline-none transition-colors pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-primary-500/40',
                metric === m ? 'bg-surface text-text ring-1 ring-border' : 'text-text-muted hover:text-text',
              )}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <p className="t-meta font-medium text-text-muted">{rows.length} {rows.length === 1 ? SUBJECT_ONE[scope] : SUBJECT[scope]}{orderNote}</p>
          <ExportMenu
            disabled={rows.length === 0}
            aria-label={`Export the ranking of ${SUBJECT[scope]}`}
            filename={`ranking-${SUBJECT[scope]}`}
            sheetName="Ranking"
            title={exportTitle({ what: `Ranking, ${SUBJECT_HEAD[scope] === 'Person' ? 'People' : `${SUBJECT_HEAD[scope]}s`}, ${METRIC_LABEL[metric]}`, from, to, filters: { Search: query.trim() } })}
            getRows={exportRows}
          />
        </div>
      </div>

      <label className="relative block">
        <span className="sr-only">Search {SUBJECT[scope]}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-light" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${SUBJECT[scope]}`}
          className={SEARCH_INPUT_CLASS}
        />
      </label>

      {rows.length === 0 && <p className="rounded-lg border border-border px-4 py-6 text-center t-card font-medium text-text-muted">No {SUBJECT[scope]} match &ldquo;{query.trim()}&rdquo;.</p>}

      <ul className={cn('flex flex-col gap-2', !compact && 'sm:hidden')}>
        {rows.map((c) => {
          const value = c[metric].overall;
          return (
            <li key={c.row.id}>
              <button
                type="button"
                onClick={() => onOpen(c.row.id)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left outline-none transition-colors hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="flex items-center gap-3">
                    {scope === 'person' && (
                      <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold text-white', avatarColorClass(c.row.name))}>{getInitials(c.row.name)}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 t-card font-display font-semibold leading-snug text-text">{c.row.name}</span>
                      {scope === 'person' && c.row.department && <span className="block line-clamp-2 t-meta text-text-muted">{c.row.department}</span>}
                    </span>
                    <span className="t-stat font-display font-bold"><Pct value={value} /></span>
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

      <div className={cn('hidden overflow-x-auto rounded-lg border border-border', !compact && 'sm:block')}>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{METRIC_LABEL[metric]} by {scope}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-hover">
              <th scope="col" aria-sort={sortKey === 'name' ? (ascending ? 'ascending' : 'descending') : 'none'} className="px-3 py-2">
                <button type="button" onClick={() => sortBy('name')} className="inline-flex min-h-8 items-center gap-1 t-meta font-display font-semibold text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
                  Name {sortKey === 'name' && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                </button>
              </th>
              {heads.map((h) => (
                <SortHead key={h.key} label={h.label} sortKey={h.key} active={sortKey} ascending={ascending} onSort={sortBy} className="min-w-28" />
              ))}
              <th scope="col" className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.row.id} className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-hover/40" onClick={() => onOpen(c.row.id)}>
                <th scope="row" className="px-3 py-2 font-normal">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(c.row.id); }} className="flex min-h-10 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
                    <span className="t-card font-display font-bold text-text">{c.row.name}</span>
                    {c.row.department && scope === 'person' && <span className="t-meta font-medium text-text-muted">{c.row.department}</span>}
                  </button>
                </th>
                {heads.map((h) => (
                  <NumCell key={h.key}>
                    <span className="flex flex-col items-end gap-1">
                      <span className="font-display"><Pct value={c[metric][h.key as Exclude<SortKey, 'name'>]} /></span>
                      <MiniBar value={c[metric][h.key as Exclude<SortKey, 'name'>]} />
                    </span>
                  </NumCell>
                ))}
                <td className="pr-3"><ChevronRight className="size-4 text-text-light" aria-hidden="true" /></td>
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
