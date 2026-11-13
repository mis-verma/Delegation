import { memo, useId, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ClipboardList, Store, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapse, EmptyState, SelectDropdown, SlidingTabs, type SlidingTabOption } from '../../../components';
import type { WeeklyReport } from '../../../api/checklistInstances';
import { FAIR_FROM } from '../../../lib/scoreBands';
import { FillCell, FillLegend } from './FillMatrix';
import { MetricBar, ScoreBadge, ScoreTrack, StackBar } from './fillParts';
import { FILL_SORT_OPTIONS, sortByScore, type FillSort } from './fillView';

type FillRow = WeeklyReport['rows'][number];
type Filter = 'all' | 'behind' | 'missed';

const matchesFilter = (row: FillRow, filter: Filter) => {
  if (filter === 'behind') return row.completion != null && row.completion < FAIR_FROM;
  if (filter === 'missed') return row.missed > 0;
  return true;
};

const rowKey = (row: FillRow) => `${row.definitionId}-${row.storeId}-${row.scopeKey}`;

const ChecklistFillCard = memo(({ row }: { row: FillRow }) => {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  return (
    <li className={cn('flex flex-col gap-3 rounded-2xl border bg-surface p-4 transition-[border-color] duration-150 ease-out hover:border-border-hover', row.missed > 0 ? 'border-vivid-red/30' : 'border-border/60')}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-700 dark:text-primary-300" aria-hidden="true">
          <ClipboardList className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 t-card font-display font-bold leading-snug text-text">{row.name}</span>
          <span className="flex min-w-0 items-center gap-1 t-meta text-text-muted">
            <Store className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{row.storeName}</span>
          </span>
        </span>
        <ScoreBadge pct={row.completion} caption="Due checklists that got filled" />
      </div>

      <ScoreTrack pct={row.completion} thick />

      <ol className="flex flex-wrap items-center justify-between gap-y-1" aria-label="Each day">
        {row.cells.map((cell) => (
          <li key={cell.date}><FillCell cell={cell} name={row.name} /></li>
        ))}
      </ol>

      <StackBar
        label="Checklists due"
        segments={[
          { key: 'onTime', label: 'On time', value: row.onTime, className: 'bg-vivid-green' },
          { key: 'late', label: 'Late', value: row.late, className: 'bg-vivid-sky' },
          { key: 'missed', label: 'Not filled', value: row.missed, className: 'bg-vivid-red' },
          { key: 'open', label: 'Open', value: row.open, className: 'bg-primary-500/40' },
        ]}
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={detailId}
        className="inline-flex h-11 w-full cursor-pointer touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-border/60 px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-[border-color,color,transform] duration-150 ease-out hover:border-border-hover hover:text-text active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-fine:h-9"
      >
        {open ? 'Hide breakdown' : 'Show breakdown'}
        <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </button>

      <Collapse open={open} id={detailId}>
        <div className="flex flex-col gap-4 pt-1">
          <MetricBar label="Questions done" done={row.questionsDone} due={row.questionsDue} pct={row.questionsPct} />
          <MetricBar label="Met deadline" done={row.onTime} due={row.due} pct={row.rate} unit={row.due === 1 ? 'day' : 'days'} />
          <MetricBar label="On time, of those filled" done={row.onTime} due={row.completed} pct={row.onTimeOfFinishedPct} />
          <MetricBar label="Answers right" done={row.answersGood} due={row.answersChecked} pct={row.compliance} />
        </div>
      </Collapse>
    </li>
  );
});
ChecklistFillCard.displayName = 'ChecklistFillCard';

export const FillChecklistCards = ({ data }: { data: WeeklyReport }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<FillSort>('low');
  const counts = useMemo(() => ({
    all: data.rows.length,
    behind: data.rows.filter((r) => matchesFilter(r, 'behind')).length,
    missed: data.rows.filter((r) => matchesFilter(r, 'missed')).length,
  }), [data.rows]);
  const shown = useMemo(
    () => sortByScore(data.rows.filter((r) => matchesFilter(r, filter)), (r) => r.completion, (r) => `${r.name} ${r.storeName}`, sort),
    [data.rows, filter, sort],
  );

  const filters: SlidingTabOption<Filter>[] = [
    { value: 'all', label: 'All checklists', shortLabel: 'All', badge: counts.all },
    { value: 'behind', label: 'Behind', icon: AlertTriangle, badge: counts.behind, badgeTone: 'danger' },
    { value: 'missed', label: 'Has misses', shortLabel: 'Misses', icon: XCircle, badge: counts.missed },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SlidingTabs label="Show" value={filter} options={filters} onChange={setFilter} size="sm" fill="phone" className="max-sm:w-full" />
        <div className="sm:w-44">
          <SelectDropdown aria-label="Sort" label="Sort" value={sort} options={FILL_SORT_OPTIONS} onChange={setSort} />
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState size="compact" icon={ClipboardList} title="No checklists here" description="Try another filter." action={{ label: 'Show all', onClick: () => setFilter('all') }} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((row) => <ChecklistFillCard key={rowKey(row)} row={row} />)}
        </ul>
      )}
      <FillLegend data={data} />
    </div>
  );
};
