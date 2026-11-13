import { memo, useCallback, useMemo, useState } from 'react';
import { CalendarCheck2, CalendarOff, CalendarPlus, Clock3, History, MessageSquareText, Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { CreateButton } from '../../components/createButton';
import { Avatar, Button, EmptyState, Fab, IconChip, InlineError, Input, PANEL_CLASS, SelectDropdown, Skeleton, useConfirm } from '../../components';
import { StatusFigureStats, type StatusFigureItem } from '../dashboard/StatusFigureStats';
import { cn } from '@/lib/utils';
import { useAuth } from '../../context/AuthContext';
import { LEAVE_RECORDER_ROLES } from '../../api/auth';
import { useIsReadOnlyViewer } from '../owner/useReadOnlyViewer';
import { useOrgToday } from '../checklist/useOrgToday';
import type { LeaveEntry } from '../../api/leave';
import { useDecideLeaveMutation, useLeaveQuery, useRemoveLeaveMutation } from './hook';
import { LeaveForm } from './LeaveForm';
import { DeclineDialog, RequestCard } from './LeaveRequests';
import { DAY, addDays, asUtc, daysBetween, leaveDays, leaveRange, openWorkText, plural } from './leaveDisplay';

const WEEKDAY_SHORT = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const WEEK = 7;
const LIST_GRID = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3';

type Show = 'all' | 'now' | 'coming' | 'recent';
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
  { key: 'all', kind: 'total', label: 'All leave', short: 'All', help: 'Approved leave now, coming up or back in the last 30 days. Tap to show it all.' },
  { key: 'now', kind: 'due', label: 'On leave now', short: 'Now', help: 'People away today. Tap to show only these, tap again to show all.' },
  { key: 'coming', kind: 'pending', label: 'Coming up', short: 'Coming', help: 'Approved leave that has not started yet. Tap to show only these, tap again to show all.' },
  { key: 'recent', kind: 'completed', label: 'Last 30 days', short: 'Past', help: 'Leave that ended in the last 30 days. Tap to show only these, tap again to show all.' },
];

const LeaveCard = memo(({ entry, today, onRemove, busy }: { entry: LeaveEntry; today: string; onRemove: (entry: LeaveEntry) => void; busy: boolean }) => {
  const phase = phaseOf(entry, today);
  const start = asUtc(entry.startDate);
  const work = openWorkText(entry);
  const past = phase === 'recent';
  const name = entry.mine ? `${entry.userName} (you)` : entry.userName;
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
            <span className={cn('line-clamp-1 t-card font-display font-bold', past ? 'text-text-secondary' : 'text-text')}>{name}</span>
            <span className="line-clamp-1 t-meta font-display text-text-muted">{entry.departmentName ?? 'No department'}</span>
          </div>
          {entry.canRemove && (
            <Button variant="ghost" size="sm" onClick={() => onRemove(entry)} aria-label={entry.mine ? 'Cancel your leave' : `Remove leave for ${entry.userName}`} className="-mr-1 size-11 shrink-0 px-0 text-text-muted hover:bg-danger/10 hover:text-danger pointer-fine:size-9">
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          )}
        </div>

        <p className="t-meta font-display font-semibold tabular-nums text-text-secondary">
          {leaveRange(entry)}
          <span className="font-medium text-text-muted">, {leaveDays(entry)}</span>
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {statusChip(entry, phase, today)}
          {!past && <IconChip icon={CalendarCheck2} tone={FAINT} label={`Back ${DAY.format(asUtc(addDays(entry.endDate, 1)))}`} labelClassName="tabular-nums" />}
          {entry.reason && <IconChip icon={MessageSquareText} tone={FAINT} label={entry.reason} title={entry.reason} labelClassName="truncate" />}
        </div>

        {work && !past && (
          <p className="flex items-start gap-1.5 rounded-lg bg-vivid-red/10 px-2.5 py-1.5 t-meta font-display font-semibold text-vivid-red-text">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Still open for {entry.mine ? 'you' : 'them'}: {work}. Hand over what cannot wait.
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

const SectionTitle = ({ title, count, hint }: { title: string; count: number; hint?: string }) => (
  <div className="flex flex-col gap-0.5">
    <h2 className="flex items-center gap-2 t-card font-display font-bold text-text">
      {title}
      <span className="t-meta font-semibold tabular-nums text-text-muted">{count}</span>
    </h2>
    {hint && <p className="hidden t-meta text-text-muted sm:block">{hint}</p>}
  </div>
);

const Group = ({ title, entries, today, onRemove, removing }: { title: string; entries: LeaveEntry[]; today: string; onRemove: (entry: LeaveEntry) => void; removing: string | null }) =>
  entries.length === 0 ? null : (
    <section aria-label={title} className="flex flex-col gap-3">
      <SectionTitle title={title} count={entries.length} />
      <ul className={LIST_GRID}>
        {entries.map((entry) => <LeaveCard key={entry.id} entry={entry} today={today} onRemove={onRemove} busy={removing === entry.id} />)}
      </ul>
    </section>
  );

const removeCopy = (entry: LeaveEntry, today: string) => {
  if (entry.mine && entry.status === 'PENDING') return { title: 'Withdraw this request?', description: `${leaveRange(entry)}. Your manager will no longer see it.`, confirmLabel: 'Withdraw', toast: 'Request withdrawn.' };
  if (entry.mine && entry.status === 'DECLINED') return { title: 'Dismiss this request?', description: 'It is removed from your list.', confirmLabel: 'Dismiss', toast: 'Request dismissed.' };
  if (entry.mine) return { title: 'Cancel your leave?', description: 'Your checklists run on these days again.', confirmLabel: 'Cancel leave', toast: 'Leave cancelled. Your checklists come back.' };
  if (entry.status === 'PENDING') return { title: `Remove the request from ${entry.userName}?`, description: 'It is deleted without a decision. Decline it instead if they should be told why.', confirmLabel: 'Remove', toast: 'Request removed.' };
  const started = entry.startDate <= today;
  return {
    title: `Remove leave for ${entry.userName}?`,
    description: started ? 'Their checklists come back for the days still ahead. Days already passed stay as they are.' : 'Their checklists will run on these days again.',
    confirmLabel: 'Remove leave',
    toast: 'Leave removed. Their checklists come back.',
  };
};

export const LeavePage = () => {
  const confirm = useConfirm();
  const today = useOrgToday();
  const { user } = useAuth();
  const readOnly = useIsReadOnlyViewer() || user?.role === 'OWNER';
  const canRecordOthers = !!user && LEAVE_RECORDER_ROLES.includes(user.role);
  const createLabel = canRecordOthers ? 'Record leave' : 'Ask for leave';
  const { data, isPending, isError, refetch } = useLeaveQuery();
  const { mutate: removeLeave, isPending: removePending, variables: removeVars } = useRemoveLeaveMutation();
  const { mutate: decideLeave, isPending: decidePending, variables: decideVars } = useDecideLeaveMutation();
  const [showForm, setShowForm] = useState(false);
  const [declining, setDeclining] = useState<LeaveEntry | null>(null);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [show, setShow] = useState<Show>('all');

  const all = useMemo(() => data ?? [], [data]);
  const { approved, toDecide, myRequests } = useMemo(() => ({
    approved: all.filter((e) => e.status === 'APPROVED'),
    toDecide: all.filter((e) => e.status === 'PENDING' && !e.mine),
    myRequests: all.filter((e) => e.mine && e.status !== 'APPROVED'),
  }), [all]);

  const departmentOptions = useMemo(() => {
    const names = [...new Set(approved.map((e) => e.departmentName).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b));
    return [{ value: '', label: 'All departments' }, ...names.map((n) => ({ value: n, label: n }))];
  }, [approved]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return approved.filter((e) => (!department || e.departmentName === department) && (!needle || e.userName.toLowerCase().includes(needle)));
  }, [approved, query, department]);

  const groups = useMemo(() => ({
    now: filtered.filter((e) => phaseOf(e, today) === 'now'),
    coming: filtered.filter((e) => phaseOf(e, today) === 'coming'),
    recent: filtered.filter((e) => phaseOf(e, today) === 'recent').reverse(),
  }), [filtered, today]);

  const upcoming = useMemo(() => approved.filter((e) => e.endDate >= today), [approved, today]);

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
    const copy = removeCopy(entry, today);
    const ok = await confirm({ title: copy.title, description: copy.description, confirmLabel: copy.confirmLabel, variant: 'danger' });
    if (ok) removeLeave({ id: entry.id, message: copy.toast });
  }, [confirm, removeLeave, today]);

  const handleRemove = useCallback((entry: LeaveEntry) => { void remove(entry); }, [remove]);
  const approve = useCallback((entry: LeaveEntry) => decideLeave({ id: entry.id, approve: true }), [decideLeave]);
  const decline = useCallback((note: string) => {
    if (!declining) return;
    decideLeave({ id: declining.id, approve: false, note: note || undefined }, { onSuccess: () => setDeclining(null) });
  }, [decideLeave, declining]);

  const removing = removePending ? removeVars?.id ?? null : null;
  const deciding = decidePending ? decideVars?.id ?? null : null;
  const busyId = (id: string) => removing === id || deciding === id;
  const nothing = !isPending && !isError && all.length === 0;
  const noApproved = !isPending && !isError && all.length > 0 && approved.length === 0;
  const noMatch = !isPending && !isError && approved.length > 0 && filtered.length === 0;
  const openForm = () => setShowForm(true);

  return (
    <div className="mx-auto flex w-full max-w-(--container-width) flex-col gap-3 pt-2.5 sm:gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="t-section font-display font-bold text-text">Leave</h1>
          <p className="hidden t-meta font-display text-text-muted sm:block">
            {canRecordOthers ? 'People on leave are skipped for checklists, so their score does not drop.' : 'Ask for days off here. Once your manager approves, your checklists are skipped on those days.'}
          </p>
        </div>
        {!readOnly && <CreateButton label={createLabel} onClick={openForm} className="hidden md:inline-flex" />}
      </div>

      {isPending && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading leave">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl sm:h-28" />)}</div>
          <div className={LIST_GRID}>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          </div>
        </div>
      )}

      {isError && <InlineError message="We couldn't load the leave list. Check your connection and try again." onRetry={() => { void refetch(); }} />}

      {toDecide.length > 0 && (
        <section aria-label="Requests waiting for a decision" className="flex flex-col gap-3">
          <SectionTitle title="Waiting for your decision" count={toDecide.length} hint="Approving skips their checklists on those days." />
          <ul className={LIST_GRID}>
            {toDecide.map((entry) => (
              <RequestCard
                key={entry.id}
                entry={entry}
                busy={busyId(entry.id)}
                onApprove={entry.canDecide && !readOnly ? approve : undefined}
                onDecline={entry.canDecide && !readOnly ? setDeclining : undefined}
              />
            ))}
          </ul>
        </section>
      )}

      {myRequests.length > 0 && (
        <section aria-label="Your requests" className="flex flex-col gap-3">
          <SectionTitle title="Your requests" count={myRequests.length} />
          <ul className={LIST_GRID}>
            {myRequests.map((entry) => (
              <RequestCard key={entry.id} entry={entry} busy={busyId(entry.id)} onWithdraw={entry.canRemove && !readOnly ? handleRemove : undefined} />
            ))}
          </ul>
        </section>
      )}

      {approved.length > 0 && (
        <>
          <StatusFigureStats label="Show leave" items={showItems} counts={counts} active={show} onToggle={toggleShow} />
          <WeekStrip entries={upcoming} today={today} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-44 flex-1 sm:max-w-72">
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

      {nothing && (
        <EmptyState
          icon={CalendarOff}
          title="Nobody is on leave"
          description={canRecordOthers
            ? 'Record leave when someone is away on a working day, so their checklists are skipped and their score stays fair.'
            : 'Need a day off? Ask here. Your manager approves it and your checklists are skipped on those days.'}
          action={readOnly ? undefined : { label: createLabel, icon: Plus, onClick: openForm }}
        />
      )}

      {noApproved && (
        <p className="rounded-2xl border border-border/60 bg-surface px-4 py-3 t-meta text-text-muted">Nobody has approved leave right now.</p>
      )}

      {noMatch && (
        <EmptyState icon={Search} title="No leave matches" description="Try another name or department." action={{ label: 'Clear search and filter', onClick: () => { setQuery(''); setDepartment(''); setShow('all'); } }} />
      )}

      {(show === 'all' || show === 'now') && <Group title="On leave now" entries={groups.now} today={today} onRemove={handleRemove} removing={removing} />}
      {(show === 'all' || show === 'coming') && <Group title="Coming up" entries={groups.coming} today={today} onRemove={handleRemove} removing={removing} />}
      {(show === 'all' || show === 'recent') && <Group title="Last 30 days" entries={groups.recent} today={today} onRemove={handleRemove} removing={removing} />}

      {!readOnly && (
        <Fab
          sheetTitle="Create"
          actions={[{
            key: 'leave',
            label: createLabel,
            description: canRecordOthers ? 'Skip their checklists for the days they are away' : 'Your manager approves it',
            icon: canRecordOthers ? CalendarOff : CalendarPlus,
            onClick: openForm,
          }]}
        />
      )}

      {showForm && <LeaveForm onClose={() => setShowForm(false)} />}
      {declining && <DeclineDialog entry={declining} busy={deciding === declining.id} onClose={() => setDeclining(null)} onConfirm={decline} />}
    </div>
  );
};
