import { memo, useId, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck2, ChevronDown, Eye, Repeat, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapse, EmptyState, IconChip, SelectDropdown, SlidingTabs, type SlidingTabOption } from '../../components';
import type { DayCell, HeatmapRow } from '../../api/exceptions';
import { FAIR_FROM } from '../../lib/scoreBands';
import { MetricBar, ScoreBadge, ScoreTrack, StackBar } from '../checklist/instance/fillParts';
import { FILL_SORT_OPTIONS, sortByScore, type FillSort } from '../checklist/instance/fillView';
import { fillTone } from '../checklist/instance/fillCount';
import { LevelAvatar } from './AttentionParts';
import { DAY_LOOK, dayMonthOf } from './attentionDisplay';

type Filter = 'all' | 'behind' | 'streak' | 'perfect';

const STRIP_DAYS = 14;
const WEEK = 7;

const dayCounts = (cells: DayCell[]) => {
  const out = { done: 0, partial: 0, missed: 0, open: 0 };
  for (const c of cells) if (c.state in out) out[c.state as keyof typeof out] += 1;
  return out;
};

const weeklyTrend = (cells: DayCell[]) => {
  const weeks: { label: string; pct: number | null }[] = [];
  for (let i = 0; i < cells.length; i += WEEK) {
    const slice = cells.slice(i, i + WEEK);
    const counts = dayCounts(slice);
    const due = counts.done + counts.partial + counts.missed;
    weeks.push({ label: `${dayMonthOf(slice[0].date)}`, pct: due ? (counts.done / due) * 100 : null });
  }
  return weeks;
};

const matchesFilter = (p: HeatmapRow, filter: Filter) => {
  if (filter === 'behind') return p.fillRate != null && p.fillRate < FAIR_FROM;
  if (filter === 'streak') return p.missedStreak >= 2;
  if (filter === 'perfect') return p.due > 0 && p.missed === 0;
  return true;
};

const DayStrip = ({ cells, today }: { cells: DayCell[]; today: string }) => {
  const recent = cells.filter((c) => c.date <= today).slice(-STRIP_DAYS);
  return (
    <ol className="flex items-center gap-1" aria-label={`Last ${recent.length} days`}>
      {recent.map((c) => (
        <li
          key={c.date}
          title={`${dayMonthOf(c.date)}: ${DAY_LOOK[c.state].label}${c.total ? ` (${c.done} of ${c.total})` : ''}`}
          className={cn('h-5 min-w-0 flex-1 rounded-[4px]', DAY_LOOK[c.state].cell, c.date === today && 'ring-2 ring-primary-500 ring-offset-1 ring-offset-surface')}
        >
          <span className="sr-only">{`${dayMonthOf(c.date)}: ${DAY_LOOK[c.state].label}`}</span>
        </li>
      ))}
    </ol>
  );
};

const TrendBars = ({ cells }: { cells: DayCell[] }) => {
  const weeks = weeklyTrend(cells);
  return (
    <div className="flex flex-col gap-2">
      <span className="t-meta font-display font-semibold text-text-secondary">Week by week</span>
      <ol className="grid grid-cols-5 items-end gap-2" aria-label="Days filled each week">
        {weeks.map((w) => (
          <li key={w.label} className="flex min-w-0 flex-col items-center gap-1">
            <span className="flex h-14 w-full items-end overflow-hidden rounded-md bg-border/40">
              <span className={cn('w-full rounded-md transition-[height] duration-500 ease-out motion-reduce:transition-none', w.pct == null ? '' : fillTone(w.pct).bar)} style={{ height: `${w.pct == null ? 0 : Math.max(6, w.pct)}%` }} />
            </span>
            <span className={cn('t-meta font-bold tabular-nums', w.pct == null ? 'text-text-light' : fillTone(w.pct).text)}>{w.pct == null ? '-' : `${Math.round(w.pct)}%`}</span>
            <span className="truncate t-meta text-text-muted">{w.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

interface PersonCardProps {
  person: HeatmapRow;
  today: string;
  onOpen: (userId: string) => void;
}

const PersonFillCard = memo(({ person: p, today, onOpen }: PersonCardProps) => {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const counts = useMemo(() => dayCounts(p.cells), [p.cells]);
  const meta = [p.departmentName, p.storeName].filter(Boolean).join(' · ');
  return (
    <li className={cn('flex flex-col gap-3 rounded-2xl border bg-surface p-4 transition-[border-color] duration-150 ease-out hover:border-border-hover', p.missedStreak >= 2 ? 'border-vivid-red/35' : 'border-border/60')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onOpen(p.userId)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          aria-label={`Open the live view for ${p.name}`}
        >
          <LevelAvatar name={p.name} src={p.avatarUrl} level={p.missedStreak >= 2 ? 'red' : null} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 t-card font-display font-bold leading-snug text-text">{p.name}</span>
            {meta && <span className="line-clamp-1 t-meta text-text-muted">{meta}</span>}
          </span>
        </button>
        <ScoreBadge pct={p.fillRate} caption="Days filled out of days due" />
      </div>

      <ScoreTrack pct={p.fillRate} thick />

      <DayStrip cells={p.cells} today={today} />

      <div className="flex flex-wrap items-center gap-1.5">
        <IconChip icon={CalendarCheck2} tone="bg-vivid-green" label={`${p.due - p.missed} of ${p.due} days`} labelClassName="tabular-nums" />
        {p.missedStreak >= 2 && <IconChip icon={Repeat} tone="bg-vivid-red" label={`Missed ${p.missedStreak} in a row`} labelClassName="text-vivid-red-text" />}
        {p.due > 0 && p.missed === 0 && <IconChip icon={Trophy} tone="bg-vivid-green" label="Never missed" labelClassName="text-vivid-green-text" />}
      </div>

      <div className="flex items-center gap-2 border-t border-border/50 pt-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={detailId}
          className="inline-flex h-11 flex-1 cursor-pointer touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-border/60 px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-[border-color,color,transform] duration-150 ease-out hover:border-border-hover hover:text-text active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-fine:h-9"
        >
          {open ? 'Hide breakdown' : 'Show breakdown'}
          <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onOpen(p.userId)}
          className="inline-flex h-11 cursor-pointer touch-manipulation items-center gap-1.5 rounded-xl bg-primary-500/10 px-3 t-meta font-display font-semibold text-primary-700 outline-none transition-[background-color,transform] duration-150 ease-out hover:bg-primary-500/15 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-primary-300 pointer-fine:h-9"
        >
          <Eye className="size-4" aria-hidden="true" />
          Live view
        </button>
      </div>

      <Collapse open={open} id={detailId}>
        <div className="flex flex-col gap-4 pt-1">
          <StackBar
            label="Days this month"
            segments={[
              { key: 'done', label: 'All filled', value: counts.done, className: 'bg-vivid-green' },
              { key: 'partial', label: 'Some not filled', value: counts.partial, className: 'bg-vivid-sky' },
              { key: 'missed', label: 'Not filled', value: counts.missed, className: 'bg-vivid-red' },
              { key: 'open', label: 'Still open', value: counts.open, className: 'bg-primary-500/40' },
            ]}
          />
          <MetricBar label="Questions done" done={p.questionsDone} due={p.questionsDue} pct={p.questionsPct} />
          <MetricBar label="Met deadline" done={p.runsOnTime} due={p.runsDue} pct={p.metDeadlinePct} />
          <MetricBar label="Answers right" done={p.answersGood} due={p.answersChecked} pct={p.compliancePct} />
          <TrendBars cells={p.cells.filter((c) => c.date <= today)} />
        </div>
      </Collapse>
    </li>
  );
});
PersonFillCard.displayName = 'PersonFillCard';

interface FillPeopleCardsProps {
  people: HeatmapRow[];
  today: string;
  onOpen: (userId: string) => void;
}

export const FillPeopleCards = ({ people, today, onOpen }: FillPeopleCardsProps) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<FillSort>('low');

  const counts = useMemo(() => ({
    all: people.length,
    behind: people.filter((p) => matchesFilter(p, 'behind')).length,
    streak: people.filter((p) => matchesFilter(p, 'streak')).length,
    perfect: people.filter((p) => matchesFilter(p, 'perfect')).length,
  }), [people]);

  const shown = useMemo(
    () => sortByScore(people.filter((p) => matchesFilter(p, filter)), (p) => p.fillRate, (p) => p.name, sort),
    [people, filter, sort],
  );

  const filters: SlidingTabOption<Filter>[] = [
    { value: 'all', label: 'Everyone', shortLabel: 'All', badge: counts.all },
    { value: 'behind', label: 'Behind', icon: AlertTriangle, badge: counts.behind, badgeTone: 'danger' },
    { value: 'streak', label: 'Missed in a row', shortLabel: 'In a row', icon: Repeat, badge: counts.streak },
    { value: 'perfect', label: 'Never missed', shortLabel: 'Perfect', icon: Trophy, badge: counts.perfect },
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
        <EmptyState size="compact" icon={Trophy} title="Nobody here" description="Try another filter." action={{ label: 'Show everyone', onClick: () => setFilter('all') }} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((p) => <PersonFillCard key={p.userId} person={p} today={today} onOpen={onOpen} />)}
        </ul>
      )}
    </div>
  );
};
