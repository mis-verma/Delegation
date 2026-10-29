import { useMemo, useState } from 'react';
import { CalendarOff, Clock3, History, Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { CreateButton } from '../../components/createButton';
import { Button, EmptyState, Fab, IconChip, InlineError, Input, PANEL_CLASS, SelectDropdown, Skeleton, useConfirm } from '../../components';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
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
const SHOW_OPTIONS: readonly Show[] = ['all', 'now', 'coming', 'recent'];

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

const statusChip = (entry: LeaveEntry, phase: Phase, today: string) => {
  if (phase === 'now') return <IconChip icon={CalendarOff} tone="bg-vivid-blue" label="On leave now" labelClassName="text-vivid-blue-text" className="border-vivid-blue/40 bg-vivid-blue/10" />;
  if (phase === 'coming') {
    const diff = daysBetween(today, entry.startDate);
    return <IconChip icon={Clock3} tone="bg-vivid-sky" label={diff === 1 ? 'Starts tomorrow' : `Starts in ${diff} days`} labelClassName="text-vivid-sky-text" className="border-vivid-sky/40 bg-vivid-sky/10" />;
  }
  return <IconChip icon={History} tone="bg-text-muted" label={`Ended ${plural(daysBetween(entry.endDate, today), 'day', 'days')} ago`} />;
};

const LeaveCard = ({ entry, today, onRemove, busy }: { entry: LeaveEntry; today: string; onRemove: (entry: LeaveEntry) => void; busy: boolean }) => {
  const phase = phaseOf(entry, today);
  const start = asUtc(entry.startDate);
  const work = openWork(entry);
  const past = phase === 'recent';
  return (
    <li className={cn(PANEL_CLASS, 'flex items-start gap-3 p-3 sm:p-4 transition-colors duration-150 hover:border-border-hover', busy && 'pointer-events-none opacity-60')}>
      <div
        aria-hidden
        className={cn(
          'flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border leading-none',
          phase === 'now' ? 'border-vivid-blue/40 bg-vivid-blue/10' : 'border-border/60 bg-surface-hover',
        )}
      >
        <span className={cn('t-meta font-display font-semibold', phase === 'now' ? 'text-vivid-blue-text' : 'text-text-muted')}>{MONTH_SHORT.format(start)}</span>
        <span className={cn('pt-0.5 font-display text-xl font-bold tabular-nums', past ? 'text-text-muted' : 'text-text')}>{start.getUTCDate()}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <span aria-hidden className={cn('flex size-7 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold text-white', avatarColorClass(entry.userName))}>
            {getInitials(entry.userName).slice(0, 2)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={cn('line-clamp-1 t-card font-display font-bold', past ? 'text-text-secondary' : 'text-text')}>{entry.userName}</span>
            <span className="line-clamp-1 t-meta font-display text-text-muted">{entry.departmentName ?? 'No department'}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onRemove(entry)} aria-label={`Remove leave for ${entry.userName}`} className="-mr-1 size-9 shrink-0 px-0 text-text-muted hover:text-danger pointer-coarse:size-11">
            <Trash2 size={16} />
          </Button>
        </div>

        <p className="t-meta font-display font-semibold tabular-nums text-text-secondary">
          {rangeText(entry)}
          <span className="font-medium text-text-muted">, {plural(spanDays(entry), 'day', 'days')}</span>
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {statusChip(entry, phase, today)}
          {entry.reason && <IconChip icon={CalendarOff} tone="bg-text-muted" label={entry.reason} />}
          {!past && <span className="t-meta font-display font-medium text-text-muted">Back {DAY.format(asUtc(addDays(entry.endDate, 1)))}</span>}
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
};

const WeekStrip = ({ entries, today }: { entries: LeaveEntry[]; today: string }) => {
  const days = Array.from({ length: WEEK }, (_, i) => addDays(today, i)).map((date) => ({
    date,
    away: entries.filter((e) => e.startDate <= date && e.endDate >= date),
  }));
  return (
    <section aria-label="Who is away this week" className={cn(PANEL_CLASS, 'flex flex-col gap-2 p-3 sm:p-4')}>
      <h2 className="t-card font-display font-bold text-text">Next 7 days</h2>
      <ul className="grid grid-cols-7 gap-1.5">
        {days.map(({ date, away }, i) => (
          <li
            key={date}
            title={away.length ? away.map((a) => a.userName).join(', ') : 'Nobody away'}
            className={cn(
              'flex min-w-0 flex-col items-center gap-0.5 rounded-xl border px-1 py-2 leading-none',
              i === 0 ? 'border-primary-500/40 bg-primary-500/10' : 'border-border/60 bg-surface',
            )}
          >
            <span className="t-meta font-display font-semibold text-text-muted">{WEEKDAY_SHORT.format(asUtc(date))}</span>
            <span className="font-display text-base font-bold tabular-nums text-text">{asUtc(date).getUTCDate()}</span>
            <span className={cn('t-meta font-display font-bold tabular-nums', away.length ? 'text-vivid-blue-text' : 'text-text-light')}>{away.length || '-'}</span>
          </li>
        ))}
      </ul>
      <p className="t-meta text-text-muted">The number is how many people are away that day.</p>
    </section>
  );
};

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

const StatTile = ({ label, value, tone, className }: { label: string; value: number; tone?: string; className?: string }) => (
  <div className={cn('flex flex-col gap-1 rounded-2xl border border-border/60 bg-surface p-3 sm:p-4', className)}>
    <span className="t-meta font-display font-medium text-text-muted">{label}</span>
    <span className={cn('t-stat font-display font-bold tabular-nums', tone ?? 'text-text')}>{value}</span>
  </div>
);

export const LeavePage = () => {
  const confirm = useConfirm();
  const today = useOrgToday();
  const { data, isPending, isError, refetch } = useLeaveQuery();
  const removeMut = useRemoveLeaveMutation();
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

  const nowAll = useMemo(() => all.filter((e) => phaseOf(e, today) === 'now'), [all, today]);
  const startingThisWeek = useMemo(() => all.filter((e) => e.startDate > today && e.startDate <= addDays(today, WEEK)).length, [all, today]);
  const openOnNow = useMemo(() => nowAll.reduce((sum, e) => sum + e.openTickets + e.openDelegations, 0), [nowAll]);
  const upcoming = useMemo(() => all.filter((e) => e.endDate >= today), [all, today]);

  const counts: Record<Show, number> = { all: filtered.length, now: groups.now.length, coming: groups.coming.length, recent: groups.recent.length };
  const labels: Record<Show, string> = { all: `All ${counts.all}`, now: `Now ${counts.now}`, coming: `Coming up ${counts.coming}`, recent: `Past ${counts.recent}` };

  const remove = async (entry: LeaveEntry) => {
    const started = entry.startDate <= today;
    const ok = await confirm({
      title: `Remove leave for ${entry.userName}?`,
      description: started ? 'Their checklists come back for the days still ahead. Days already passed stay as they are.' : 'Their checklists will run on these days again.',
      confirmLabel: 'Remove leave',
      variant: 'danger',
    });
    if (ok) removeMut.mutate(entry.id);
  };

  const removing = removeMut.isPending ? removeMut.variables ?? null : null;
  const handleRemove = (entry: LeaveEntry) => { void remove(entry); };
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="On leave now" value={nowAll.length} tone="text-vivid-blue-text" />
            <StatTile label="Starting this week" value={startingThisWeek} />
            <StatTile label="Work still open for them" value={openOnNow} tone={openOnNow > 0 ? 'text-vivid-red-text' : undefined} className="col-span-2 sm:col-span-1" />
          </div>
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
            <PeriodTabControl value={show} options={SHOW_OPTIONS} labels={labels} onChange={setShow} />
          </div>
        </>
      )}

      {isPending && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
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
