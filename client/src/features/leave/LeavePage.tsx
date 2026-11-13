import { memo, useCallback, useMemo, useState } from 'react';
import { CalendarCheck2, CalendarOff, Clock3, History, MessageSquareText, Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { CreateButton } from '../../components/createButton';
import { Avatar, Button, EmptyState, Fab, IconChip, InlineError, Input, PANEL_CLASS, SelectDropdown, Skeleton, useConfirm } from '../../components';
import { StatusFigureStats, type StatusFigureItem } from '../dashboard/StatusFigureStats';
import { cn } from '@/lib/utils';
import { useOrgToday } from '../checklist/useOrgToday';
import type { LeaveEntry } from '../../api/leave';
import { useLeaveQuery, useRemoveLeaveMutation } from './hook';
import { LeaveForm } from './LeaveForm';

const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const WEEKDAY_SHORT = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const DAY_MS = 86_400_000;
const WEEK = 7;

type Show = 'all' | 'now' | 'coming' | 'recent';

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const addDays = (date: string, n: number) => new Date(asUtc(date).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((asUtc(to).getTime() - asUtc(from).getTime()) / DAY_MS);
const spanDays = (entry: LeaveEntry) => daysBetween(entry.startDate, entry.endDate) + 1;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const rangeText = (entry: LeaveEntry) =>
  entry.startDate === entry.endDate ? DAY.format(asUtc(entry.startDate)) : `${DAY.format(asUtc(entry.startDate))} to ${DAY.format(asUtc(entry.endDate))}`;

const openWork = (entry: LeaveEntry) =>
  [entry.openTickets > 0 && plural(entry.openTickets, 'ticket', 'tickets'), entry.openDelegations > 0 && plural(entry.openDelegations, 'delegation', 'delegations')]
    .filter(Boolean)
    .join(' and ');

type Phase = 'now' | 'coming' | 'recent';

const phaseOf = (entry: LeaveEntry, today: string): Phase =>
  entry.startDate > today ? 'coming' : entry.endDate < today ? 'recent' : 'now';

const FAINT = 'bg-surface-hover/80';

const statusChip = (entry: LeaveEntry, phase: Phase, today: string) => {
  if (phase === 'now') return <IconChip icon={CalendarOff} tone="bg-vivid-blue" label="On leave now" labelClassName="text-vivid-blue-text" />;
  if (phase === 'coming') {
    const diff = daysBetween(today, entry.startDate);
    return <IconChip icon={Clock3} tone="bg-vivid-sky" label={diff === 1 ? 'Starts tomorrow' : `Starts in ${diff} days`} labelClassName="text-vivid-sky-text" />;
  }
  return <IconChip icon={History} tone={FAINT} label={`Ended ${plural(daysBetween(entry.endDate, today), 'day', 'days')} ago`} />;
};

const SHOW_ITEMS: readonly StatusFigureItem<Show>[] = [
  { key: 'all', kind: 'total', label: 'All leave', short: 'All', help: 'Everyone on leave now, coming up or back in the last 30 days. Tap to show them all.' },
  { key: 'now', kind: 'due', label: 'On leave now', short: 'Now', help: 'People away today. Tap to show only these, tap again to show all.' },
  { key: 'coming', kind: 'pending', label: 'Coming up', short: 'Coming', help: 'Leave that has not started yet. Tap to show only these, tap again to show all.' },
  { key: 'recent', kind: 'completed', label: 'Last 30 days', short: 'Past', help: 'Leave that ended in the last 30 days. Tap to show only these, tap again to show all.' },
];

const LeaveCard = memo(({ entry, today, onRemove, busy }: { entry: LeaveEntry; today: string; onRemove: (entry: LeaveEntry) => void; busy: boolean }) => {
  const phase = phaseOf(entry, today);
  const start = asUtc(entry.startDate);
  const work = openWork(entry);
  const past = phase === 'recent';
  return (
    <li aria-busy={busy || undefined} className={cn(PANEL_CLASS, 'flex items-start gap-3 p-3 transition-[border-color,opacity] duration-150 ease-out hover:border-border-hover sm:p-4', past && 'bg-surface-hover/30', busy && 'pointer-events-none opacity-60')}>
      <div
        aria-hidden
        className={cn(
          'flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border leading-none',
          phase === 'now' ? 'border-vivid-blue/40 bg-vivid-blue/10' : 'border-border/60 bg-surface-hover',
        )}
      >
        <span className={cn('t-meta font-display font-semibold', phase === 'now' ? 'text-vivid-blue-text' : 'text-text-muted')}>{MONTH_SHORT.format(start)}</span>
        <span className={cn('pt-0.5 t-stat font-figure font-bold tabular-nums', past ? 'text-text-muted' : 'text-text')}>{start.getUTCDate()}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Avatar name={entry.userName} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={cn('line-clamp-1 t-card font-display font-bold', past ? 'text-text-secondary' : 'text-text')}>{entry.userName}</span>
            <span className="line-clamp-1 t-meta font-display text-text-muted">{entry.departmentName ?? 'No department'}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onRemove(entry)} aria-label={`Remove leave for ${entry.userName}`} className="-mr-1 size-11 shrink-0 px-0 text-text-muted hover:bg-danger/10 hover:text-danger pointer-fine:size-9">
            <Trash2 size={16} aria-hidden="true" />
          </Button>
        </div>

        <p className="t-meta font-display font-semibold tabular-nums text-text-secondary">
          {rangeText(entry)}
          <span className="font-medium text-text-muted">, {plural(spanDays(entry), 'day', 'days')}</span>
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {statusChip(entry, phase, today)}
          {!past && <IconChip icon={CalendarCheck2} tone={FAINT} label={`Back ${DAY.format(asUtc(addDays(entry.endDate, 1)))}`} labelClassName="tabular-nums" />}
          {entry.reason && <IconChip icon={MessageSquareText} tone={FAINT} label={entry.reason} title={entry.reason} labelClassName="truncate" />}
        </div>

        {work && !past && (
          <p className="flex items-start gap-1.5 rounded-lg bg-vivid-red/10 px-2.5 py-1.5 t-meta font-display font-semibold text-vivid-red-text">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Still open for them: {work}. Hand over what cannot wait.
          </p>
        )}
      </div>
    </li>
  );
});
LeaveCard.displayName = 'LeaveCard';

const WeekStrip = memo(({ entries, today }: { entries: LeaveEntry[]; today: string }) => {
  const days = useMemo(() => Array.from({ length: WEEK }, (_, i) => addDays(today, i)).map((date) => ({
    date,
    away: entries.filter((e) => e.startDate <= date && e.endDate >= date),
  })), [entries, today]);
  return (
    <section aria-label="Who is away this week" className={cn(PANEL_CLASS, 'flex flex-col gap-2 p-3 sm:p-4')}>
      <h2 className="t-card font-display font-bold text-text">Next 7 days</h2>
      <ul className="grid grid-cols-7 gap-1.5">
        {days.map(({ date, away }, i) => (
          <li
            key={date}
            title={away.length ? away.map((a) => a.userName).join(', ') : 'Nobody away'}
            className={cn(
              'flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 leading-none',
              i === 0 ? 'border-primary-500/40 bg-primary-500/10' : 'border-border/60 bg-surface',
            )}
          >
            <span className="t-meta font-display font-semibold text-text-muted">{WEEKDAY_SHORT.format(asUtc(date))}</span>
            <span className="t-card font-display font-bold tabular-nums text-text">{asUtc(date).getUTCDate()}</span>
            <span className={cn('t-meta font-display font-bold tabular-nums', away.length ? 'text-vivid-blue-text' : 'text-text-light')}>{away.length || '-'}</span>
          </li>
        ))}
      </ul>
      <p className="t-meta text-text-muted">The number is how many people are away that day.</p>
    </section>
  );
});
WeekStrip.displayName = 'WeekStrip';

const Group = ({ title, entries, today, onRemove, removing }: { title: string; entries: LeaveEntry[]; today: string; onRemove: (entry: LeaveEntry) => void; removing: string | null }) =>
  entries.length === 0 ? null : (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 t-card font-display font-bold text-text">
        {title}
        <span className="t-meta font-semibold tabular-nums text-text-muted">{entries.length}</span>
      </h2>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => <LeaveCard key={entry.id} entry={entry} today={today} onRemove={onRemove} busy={removing === entry.id} />)}
      </ul>
    </section>
  );


export const LeavePage = () => {
  const confirm = useConfirm();
  const today = useOrgToday();
  const { data, isPending, isError, refetch } = useLeaveQuery();
  const { mutate: removeLeave, isPending: removePending, variables: removingId } = useRemoveLeaveMutation();
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [show, setShow] = useState<Show>('all');

  const all = useMemo(() => data ?? [], [data]);
  const departmentOptions = useMemo(() => {
    const names = [...new Set(all.map((e) => e.departmentName).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b));
    return [{ value: '', label: 'All departments' }, ...names.map((n) => ({ value: n, label: n }))];
  }, [all]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((e) => (!department || e.departmentName === department) && (!needle || e.userName.toLowerCase().includes(needle)));
  }, [all, query, department]);

  const groups = useMemo(() => ({
    now: filtered.filter((e) => phaseOf(e, today) === 'now'),
    coming: filtered.filter((e) => phaseOf(e, today) === 'coming'),
    recent: filtered.filter((e) => phaseOf(e, today) === 'recent').reverse(),
  }), [filtered, today]);

  const upcoming = useMemo(() => all.filter((e) => e.endDate >= today), [all, today]);

  const counts: Record<Show, number> = { all: filtered.length, now: groups.now.length, coming: groups.coming.length, recent: groups.recent.length };
  const showItems = useMemo<StatusFigureItem<Show>[]>(() => {
    const weekEnd = addDays(today, WEEK);
    const openOnNow = groups.now.reduce((sum, e) => sum + e.openTickets + e.openDelegations, 0);
    const startingThisWeek = groups.coming.filter((e) => e.startDate <= weekEnd).length;
    const notes: Partial<Record<Show, string>> = {
      now: openOnNow > 0 ? `${plural(openOnNow, 'item', 'items')} still open` : 'Nothing left open',
      coming: `${startingThisWeek} start this week`,
    };
    return SHOW_ITEMS.map((item) => (notes[item.key] ? { ...item, note: notes[item.key] } : item));
  }, [groups, today]);
  const toggleShow = useCallback((key: Show) => setShow((prev) => (prev === key ? 'all' : key)), []);

  const remove = useCallback(async (entry: LeaveEntry) => {
    const started = entry.startDate <= today;
    const ok = await confirm({
      title: `Remove leave for ${entry.userName}?`,
      description: started ? 'Their checklists come back for the days still ahead. Days already passed stay as they are.' : 'Their checklists will run on these days again.',
      confirmLabel: 'Remove leave',
      variant: 'danger',
    });
    if (ok) removeLeave(entry.id);
  }, [confirm, removeLeave, today]);

  const removing = removePending ? removingId ?? null : null;
  const handleRemove = useCallback((entry: LeaveEntry) => { void remove(entry); }, [remove]);
  const none = !isPending && !isError && all.length === 0;
  const noMatch = !isPending && !isError && all.length > 0 && filtered.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-(--container-width) flex-col gap-3 pt-2.5 sm:gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="t-section font-display font-bold text-text">Leave</h1>
          <p className="hidden t-meta font-display text-text-muted sm:block">People on leave are skipped for checklists, so their score does not drop.</p>
        </div>
        <CreateButton label="Record leave" onClick={() => setShowForm(true)} className="hidden md:inline-flex" />
      </div>

      {!isPending && !isError && all.length > 0 && (
        <>
          <StatusFigureStats label="Show leave" items={showItems} counts={counts} active={show} onToggle={toggleShow} />
          <WeekStrip entries={upcoming} today={today} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-44 flex-1 sm:max-w-64">
              <Input id="leave-search" type="search" icon={Search} aria-label="Search people on leave" placeholder="Search people..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {departmentOptions.length > 2 && (
              <div className="w-full sm:w-52">
                <SelectDropdown aria-label="Filter by department" value={department} options={departmentOptions} onChange={setDepartment} />
              </div>
            )}
          </div>
        </>
      )}

      {isPending && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading leave">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl sm:h-28" />)}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          </div>
        </div>
      )}

      {isError && <InlineError message="We couldn't load the leave list. Check your connection and try again." onRetry={() => { void refetch(); }} />}

      {none && (
        <EmptyState
          icon={CalendarOff}
          title="Nobody is on leave"
          description="Record leave when someone is away on a working day, so their checklists are skipped and their score stays fair."
          action={{ label: 'Record leave', icon: Plus, onClick: () => setShowForm(true) }}
        />
      )}

      {noMatch && (
        <EmptyState icon={Search} title="No leave matches" description="Try another name or department." action={{ label: 'Clear search and filter', onClick: () => { setQuery(''); setDepartment(''); setShow('all'); } }} />
      )}

      {(show === 'all' || show === 'now') && <Group title="On leave now" entries={groups.now} today={today} onRemove={handleRemove} removing={removing} />}
      {(show === 'all' || show === 'coming') && <Group title="Coming up" entries={groups.coming} today={today} onRemove={handleRemove} removing={removing} />}
      {(show === 'all' || show === 'recent') && <Group title="Last 30 days" entries={groups.recent} today={today} onRemove={handleRemove} removing={removing} />}

      <Fab sheetTitle="Create" actions={[{ key: 'leave', label: 'Record leave', description: 'Skip their checklists for the days they are away', icon: CalendarOff, onClick: () => setShowForm(true) }]} />

      {showForm && <LeaveForm onClose={() => setShowForm(false)} />}
    </div>
  );
};
