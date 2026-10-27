import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BellRing, ChevronRight, Search, Star, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NO_DEPARTMENT_ROW_ID, UNASSIGNED_ROW_ID, type ScoreReportRow, type ScoreScope } from '../../api/scores';
import { useScoreReport, useStoreScoreReport } from './scoreQueries';
import { acrossModules, overallOf } from './scoreMetrics';
import { formatPct, roundPct } from '../../lib/percent';
import { MODULE_LABEL, SCORE_LABEL, SCORE_LABEL_SHORT } from '../../lib/scoreLabels';
import { SEARCH_INPUT_CLASS } from '../scores/controlStyles';
import type { RateTone } from './dashboardDisplay';
import { ScorePct } from '../scores/ScorePct';
import { NumCell, SortHead } from '../scores/scoreTableParts';
import { Skeleton } from '../../components/skeleton';
import { Button } from '../../components/button';
import { IconChip } from '../../components/iconChip';
import { InlineError } from '../../components/inlineError';
import { ExportMenu } from '../../components/exportMenu';
import { exportTitle, type TableRows } from '../../lib/exportTable';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import type { ScoreMetric } from './scoreMetrics';
import { toneOf } from './scoreTone';
import { FAIR_FROM } from '../../lib/scoreBands';
import { useRemindMutation } from '../attention/useAttention';
import { useWatchedPeople } from './useWatchedPeople';

type Metric = 'overview' | 'completion' | 'compliance' | 'ontime';
type SortKey = 'name' | 'overall' | 'checklist' | 'ticket' | 'delegation';
type ModuleColumn = 'checklist' | 'ticket' | 'delegation';

const PREVIEW_ROWS = 8;

const METRIC_LABEL: Record<Metric, string> = { overview: SCORE_LABEL.overall, completion: SCORE_LABEL.completion, compliance: SCORE_LABEL.compliance, ontime: SCORE_LABEL_SHORT.onTime };
const SUBJECT: Record<ScoreScope, string> = { org: 'departments', person: 'people', department: 'departments', store: 'stores' };
const SUBJECT_ONE: Record<ScoreScope, string> = { org: 'department', person: 'person', department: 'department', store: 'store' };
const SUBJECT_HEAD: Record<ScoreScope, string> = { org: 'Department', person: 'Person', department: 'Department', store: 'Store' };

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

const HEAT: Record<RateTone, string> = {
  success: '',
  warning: 'bg-vivid-sky/15',
  danger: 'bg-vivid-red/12',
  neutral: '',
};

const HEAT_TEXT: Record<RateTone, string> = { success: 'text-vivid-green-text', warning: 'text-vivid-sky-text', danger: 'text-vivid-red-text', neutral: 'text-text-muted' };

const HeatPct = ({ value }: { value: number | null }) => {
  const tone = toneOf(value);
  return (
    <span className={cn('inline-flex min-w-16 items-center justify-end rounded-md px-2 py-1 font-display font-bold tabular-nums', HEAT[tone], HEAT_TEXT[tone])}>
      {value === null ? '-' : formatPct(value)}
    </span>
  );
};

interface ScoreRankingProps {
  compact?: boolean;
  metric?: ScoreMetric;
  scope: ScoreScope;
  from: string;
  to: string;
  onOpen: (id: string) => void;
  canRemind?: boolean;
}

const EDGE_ROWS = 5;

export const ScoreRanking = ({ compact = false, metric: controlled, scope, from, to, onOpen, canRemind = false }: ScoreRankingProps) => {
  const [localMetric, setMetric] = useState<Metric>('completion');
  const metric: Metric = controlled ?? localMetric;
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [ascending, setAscending] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const { watched, toggle: toggleWatch } = useWatchedPeople();
  const remind = useRemindMutation();

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
      if (diff !== 0) return ascending ? diff : -diff;
      return b.due - a.due || a.row.name.localeCompare(b.row.name);
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

  const activeModules = (['checklist', 'ticket', 'delegation'] as const).filter((m: ModuleColumn) => rows.some((c) => c[metric][m] !== null));
  const showModules = activeModules.length > 1;
  const heads: { key: SortKey; label: string }[] = [
    { key: 'overall', label: 'Overall' },
    ...(showModules ? activeModules.map((m) => ({ key: m as SortKey, label: MODULE_LABEL[m] })) : []),
  ];
  const searching = query.trim().length > 0;
  const isPeople = scope === 'person';
  const ordered = useMemo(
    () => (isPeople && watched.size ? [...rows.filter((c) => watched.has(c.row.id)), ...rows.filter((c) => !watched.has(c.row.id))] : rows),
    [rows, watched, isPeople],
  );
  const scoredRows = rows.filter((c) => c[metric].overall !== null);
  const previewMode = !searching && !showAll && scoredRows.length > PREVIEW_ROWS;
  const edge = Math.min(EDGE_ROWS, Math.floor(scoredRows.length / 2));
  const bestFirst = [...scoredRows].sort(
    (a, b) => (b[metric].overall as number) - (a[metric].overall as number) || b.due - a.due || a.row.name.localeCompare(b.row.name),
  );
  const unwatched = (list: Computed[]) => (isPeople ? list.filter((c) => !watched.has(c.row.id)) : list);
  const lowestRows = unwatched(bestFirst.slice(bestFirst.length - edge).reverse());
  const highestRows = unwatched(bestFirst.slice(0, edge));
  const watchRows = isPeople ? rows.filter((c) => watched.has(c.row.id)) : [];
  const topValue = highestRows[0]?.[metric].overall ?? null;
  const topRows = topValue === null ? [] : highestRows.filter((c) => c[metric].overall === topValue);
  const topIds = new Set(topRows.map((c) => c.row.id));
  const topTied = topRows.length > 1;
  const shown = showAll || searching ? ordered : ordered.slice(0, PREVIEW_ROWS);
  const hiddenCount = previewMode ? 0 : ordered.length - shown.length;

  const lineActions = (c: Computed) => {
    const value = c[metric].overall;
    const remindable = canRemind && isPeople && value !== null && value < FAIR_FROM;
    const on = watched.has(c.row.id);
    return (
      <>
        {remindable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={remind.isPending}
            onClick={(e) => { e.stopPropagation(); remind.mutate([c.row.id]); }}
            aria-label={`Remind ${c.row.name}`}
            className="shrink-0"
          >
            <BellRing className="size-3.5" aria-hidden="true" />
            Remind
          </Button>
        )}
        {isPeople && (
          <button
            type="button"
            aria-pressed={on}
            aria-label={on ? `Stop watching ${c.row.name}` : `Watch ${c.row.name}`}
            onClick={(e) => { e.stopPropagation(); toggleWatch(c.row.id); }}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-text-light outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:size-11"
          >
            <Star className={cn('size-4', on && 'fill-primary-500 text-primary-600')} aria-hidden="true" />
          </button>
        )}
      </>
    );
  };

  const renderLine = (c: Computed, top = false) => (
    <li key={c.row.id} className="flex items-center gap-1 pr-2">
      <button
        type="button"
        onClick={() => onOpen(c.row.id)}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left outline-none transition-colors hover:bg-surface-hover/50 focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
      >
        {isPeople && (
          <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold text-white', avatarColorClass(c.row.name))}>{getInitials(c.row.name)}</span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="line-clamp-1 t-card font-display font-bold text-text">{c.row.name}</span>
            {top && <IconChip className="shrink-0" icon={Trophy} tone="bg-primary-600" label={topTied ? 'Top, tied' : 'Top'} />}
          </span>
          {isPeople && c.row.department && <span className="line-clamp-1 t-meta text-text-muted">{c.row.department}</span>}
        </span>
      </button>
      {lineActions(c)}
      <HeatPct value={c[metric].overall} />
    </li>
  );

  const renderGroup = (title: string, list: Computed[], withTop = false) =>
    list.length === 0 ? null : (
      <section aria-label={title} className="flex min-w-0 flex-col gap-1">
        <h4 className="t-meta font-display font-bold text-text-muted">{title}</h4>
        <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
          {list.map((c) => renderLine(c, withTop && topIds.has(c.row.id)))}
        </ul>
        {withTop && topTied && (
          <p className="t-meta font-medium text-text-muted">{topRows.length} tied at {formatPct(topValue ?? 0)}. Ties are listed by items due, then name.</p>
        )}
      </section>
    );
  const showMore = hiddenCount > 0 && (
    <button
      type="button"
      onClick={() => setShowAll(true)}
      className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border bg-surface t-meta font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11"
    >
      Show all {rows.length}
    </button>
  );

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

      {previewMode && (
        <div className="flex flex-col gap-3">
          {renderGroup('Watching', watchRows)}
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            {renderGroup('Needs help', lowestRows)}
            <div className="hidden @3xl:block">{renderGroup('Doing well', highestRows, true)}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border bg-surface t-meta font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11"
          >
            Show all {rows.length}
          </button>
        </div>
      )}

      <ul className={cn('flex flex-col gap-2', !compact && 'sm:hidden', previewMode && 'hidden')}>
        {shown.map((c) => {
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
                  {showModules && (
                    <span className="flex flex-wrap gap-x-4 gap-y-1 t-meta font-display text-text-muted">
                      {activeModules.map((m) => (
                        <span key={m} className="inline-flex items-baseline gap-1.5">{MODULE_LABEL[m]}<Pct value={c[metric][m]} /></span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={cn('hidden overflow-x-auto rounded-lg border border-border', !compact && !previewMode && 'sm:block')}>
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
            {shown.map((c) => (
              <tr key={c.row.id} className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-hover/40" onClick={() => onOpen(c.row.id)}>
                <th scope="row" className="px-3 py-2 font-normal">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(c.row.id); }} className="flex min-h-10 items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
                    {scope === 'person' && (
                      <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold text-white', avatarColorClass(c.row.name))}>{getInitials(c.row.name)}</span>
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="t-card font-display font-bold text-text">{c.row.name}</span>
                      {c.row.department && scope === 'person' && <span className="t-meta font-medium text-text-muted">{c.row.department}</span>}
                    </span>
                  </button>
                </th>
                {heads.map((h) => (
                  <NumCell key={h.key}>
                    <HeatPct value={c[metric][h.key as Exclude<SortKey, 'name'>]} />
                  </NumCell>
                ))}
                <td className="pr-3">
                  <span className="flex items-center justify-end gap-1">
                    {lineActions(c)}
                    <ChevronRight className="size-4 text-text-light" aria-hidden="true" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showMore}
      {showAll && !searching && scoredRows.length > PREVIEW_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border bg-surface t-meta font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11"
        >
          Show fewer
        </button>
      )}

      <p className="hidden t-meta font-medium text-text-muted sm:block">
        {metric === 'overview' ? 'Overall score: completion and compliance counted equally.' : 'Big figure: all three together.'}
      </p>
    </div>
  );
};
