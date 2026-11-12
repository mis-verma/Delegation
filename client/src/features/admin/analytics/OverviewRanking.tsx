import { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, Building2, ChevronRight, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, InlineError, PANEL_CLASS, SlidingTabs, Skeleton, type SlidingTabOption } from '../../../components';
import { STAT_FIGURE } from '../../../components/statSurface';
import type { ExplorerRow, ExplorerView } from '../../../api/scores';
import { useScoreExplorer } from '../../scores/useScoreExplorer';
import { asTrailItem, serializeTrail } from '../../scores/scoresDisplay';
import { TONE_BAR, TONE_TEXT, toneOf } from '../../dashboard/scoreTone';
import { DashCardHeader, DashCardLink } from '../../dashboard/DashCardHeader';
import { formatPct, roundPct } from '../../../lib/percent';
import type { OverviewScoreWindow } from './useOverviewScores';

type Group = 'department' | 'store';
type SortKey = 'overall' | 'checklist' | 'ticket' | 'delegation' | 'due' | 'name';

const GROUPS: readonly SlidingTabOption<Group>[] = [
  { value: 'department', label: 'Departments', icon: Building2 },
  { value: 'store', label: 'Stores', icon: Store },
];

interface Column {
  key: SortKey;
  label: string;
  hideOnPhone?: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: 'overall', label: 'Score' },
  { key: 'checklist', label: 'Checklists', hideOnPhone: true },
  { key: 'ticket', label: 'Tickets', hideOnPhone: true },
  { key: 'delegation', label: 'Delegations', hideOnPhone: true },
  { key: 'due', label: 'Due', hideOnPhone: true },
];

const valueOf = (row: ExplorerRow, key: SortKey): number | string | null => {
  switch (key) {
    case 'overall': return row.overall;
    case 'checklist': return row.checklist.score;
    case 'ticket': return row.ticket.score;
    case 'delegation': return row.delegation.score;
    case 'due': return row.totalDue;
    default: return row.name;
  }
};

const PctCell = ({ value }: { value: number | null }) => (
  <span className={cn('tabular-nums', value === null ? 'text-text-light' : TONE_TEXT[toneOf(value)])}>{value === null ? '-' : formatPct(roundPct(value) ?? value)}</span>
);

interface OverviewRankingProps {
  scoreWindow: OverviewScoreWindow;
  fixedGroup?: Group;
  limit?: number;
}

export const OverviewRanking = memo(({ scoreWindow, fixedGroup, limit }: OverviewRankingProps) => {
  const { from, to } = scoreWindow;
  const navigate = useNavigate();
  const [pickedGroup, setGroup] = useState<Group>('department');
  const group = fixedGroup ?? pickedGroup;
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'overall', dir: 'asc' });
  const view: ExplorerView = group;
  const query = useScoreExplorer({ from, to, view });
  const data = query.data;

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter((r) => r.rankable && r.totalDue > 0);
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = valueOf(a, sort.key);
      const y = valueOf(b, sort.key);
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y)) * factor;
      return (x - y) * factor || a.name.localeCompare(b.name);
    });
  }, [data, sort]);

  const toggleSort = (key: SortKey) => setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'asc' }));

  const open = (row: ExplorerRow) => {
    const item = asTrailItem(row);
    const trail = item ? serializeTrail([item]) : null;
    const next: ExplorerView = group === 'department' ? 'person' : 'department';
    void navigate(`/admin/scores?${new URLSearchParams({ view: next, from, to, ...(trail ? { trail } : {}) }).toString()}`, { viewTransition: true });
  };

  const allScoresHref = `/admin/scores?${new URLSearchParams({ view: group, from, to }).toString()}`;
  const shownRows = limit ? rows.slice(0, limit) : rows;
  const hiddenCount = rows.length - shownRows.length;

  return (
    <section aria-labelledby={`overview-ranking-${group}`} className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      <DashCardHeader
        id={`overview-ranking-${group}`}
        title={fixedGroup ? (fixedGroup === 'department' ? 'Departments' : 'Stores') : 'Where to look first'}
        subtitle={fixedGroup ? 'Lowest scores on top. Tap a row to see who.' : 'Lowest scores on top. Tap a column to sort, tap a row to see the people.'}
        action={<DashCardLink to={allScoresHref}>All scores</DashCardLink>}
      />
      <div className="flex flex-col gap-3 px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
        {!fixedGroup && <SlidingTabs label="Group by" value={group} options={GROUPS} onChange={setGroup} size="sm" />}
        {query.isError && !data ? (
          <InlineError message="Couldn't load the ranking." onRetry={() => void query.refetch()} />
        ) : !data ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading the ranking">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={group === 'department' ? Building2 : Store} title="Nothing was due" description="No scores for this period yet." />
        ) : (
          <div className="flex flex-col gap-1 overflow-x-auto">
            <table className="w-full min-w-[22rem] border-separate border-spacing-0">
              <caption className="sr-only">Scores by {group}, sortable</caption>
              <thead>
                <tr>
                  <th scope="col" aria-sort={sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="pb-2 text-left">
                    <button type="button" onClick={() => toggleSort('name')} className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md t-meta font-display font-semibold text-text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50">
                      Name
                      {sort.key === 'name' && (sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                    </button>
                  </th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('pb-2 text-right', c.hideOnPhone && 'max-sm:hidden')}>
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md t-meta font-display font-semibold text-text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/50">
                        {c.label}
                        {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="w-6 pb-2"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((row) => {
                  const tone = toneOf(row.overall);
                  return (
                    <tr key={row.id} className="group cursor-pointer transition-colors duration-150 hover:bg-surface-hover/50" onClick={() => open(row)}>
                      <th scope="row" className="rounded-l-xl border-t border-border/40 py-2 pl-1 pr-3 text-left">
                        <button type="button" onClick={(e) => { e.stopPropagation(); open(row); }} className="flex min-h-9 w-full cursor-pointer flex-col items-start gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50">
                          <span className="line-clamp-1 t-card font-display font-semibold text-text">{row.name}</span>
                          <span className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-border/50" aria-hidden="true">
                            <span className={cn('block h-full rounded-full', TONE_BAR[tone])} style={{ width: `${Math.max(3, Math.min(100, row.overall ?? 0))}%` }} />
                          </span>
                        </button>
                      </th>
                      <td className={cn('border-t border-border/40 px-2 py-2 text-right t-card font-extrabold', STAT_FIGURE)}><PctCell value={row.overall} /></td>
                      <td className="border-t border-border/40 px-2 py-2 text-right t-meta font-semibold max-sm:hidden"><PctCell value={row.checklist.score} /></td>
                      <td className="border-t border-border/40 px-2 py-2 text-right t-meta font-semibold max-sm:hidden"><PctCell value={row.ticket.score} /></td>
                      <td className="border-t border-border/40 px-2 py-2 text-right t-meta font-semibold max-sm:hidden"><PctCell value={row.delegation.score} /></td>
                      <td className="border-t border-border/40 px-2 py-2 text-right t-meta font-semibold tabular-nums text-text-secondary max-sm:hidden">{row.totalDue}</td>
                      <td className="rounded-r-xl border-t border-border/40 py-2 pl-1 pr-1 text-right">
                        <ChevronRight className="size-4 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hiddenCount > 0 && (
              <button type="button" onClick={() => void navigate(allScoresHref, { viewTransition: true })} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1 rounded-xl t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:bg-surface-hover/50 hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
                See all {rows.length}
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
});
OverviewRanking.displayName = 'OverviewRanking';
