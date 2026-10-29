import { useMemo, useState } from 'react';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { CreateButton } from '../../components/createButton';
import { Button, EmptyState, Fab, InlineError, PANEL_CLASS, Skeleton, useConfirm } from '../../components';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import { cn } from '@/lib/utils';
import { useOrgToday } from '../checklist/useOrgToday';
import type { LeaveEntry } from '../../api/leave';
import { useLeaveQuery, useRemoveLeaveMutation } from './hook';
import { LeaveForm } from './LeaveForm';

const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const DAY_MS = 86_400_000;

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const spanDays = (entry: LeaveEntry) => Math.round((asUtc(entry.endDate).getTime() - asUtc(entry.startDate).getTime()) / DAY_MS) + 1;
const rangeText = (entry: LeaveEntry) =>
  entry.startDate === entry.endDate ? DAY.format(asUtc(entry.startDate)) : `${DAY.format(asUtc(entry.startDate))} to ${DAY.format(asUtc(entry.endDate))}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const LeaveCard = ({ entry, onRemove, busy }: { entry: LeaveEntry; onRemove: (entry: LeaveEntry) => void; busy: boolean }) => {
  const open = entry.openTickets + entry.openDelegations;
  const days = spanDays(entry);
  return (
    <li className={cn(PANEL_CLASS, 'flex flex-col gap-2 p-3 sm:p-4', busy && 'pointer-events-none opacity-60')}>
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-full t-card font-display font-bold text-white', avatarColorClass(entry.userName))}>
          {getInitials(entry.userName).slice(0, 2)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-1 t-card font-display font-bold text-text">{entry.userName}</span>
          <span className="line-clamp-1 t-meta font-display text-text-muted">{entry.departmentName ?? 'No department'}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onRemove(entry)} aria-label={`Remove leave for ${entry.userName}`} className="size-9 shrink-0 px-0 pointer-coarse:size-11 text-text-muted hover:text-danger">
          <Trash2 size={16} />
        </Button>
      </div>
      <p className="t-meta font-display font-semibold tabular-nums text-text-secondary">
        {rangeText(entry)}
        <span className="font-medium text-text-muted">, {plural(days, 'day', 'days')}{entry.reason ? `, ${entry.reason}` : ''}</span>
      </p>
      {open > 0 && (
        <p className="t-meta font-display text-text-muted">
          Still open for them: {[entry.openTickets > 0 && plural(entry.openTickets, 'ticket', 'tickets'), entry.openDelegations > 0 && plural(entry.openDelegations, 'delegation', 'delegations')].filter(Boolean).join(' and ')}.
        </p>
      )}
    </li>
  );
};

const Group = ({ title, entries, onRemove, removing }: { title: string; entries: LeaveEntry[]; onRemove: (entry: LeaveEntry) => void; removing: string | null }) =>
  entries.length === 0 ? null : (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 t-card font-display font-bold text-text">
        {title}
        <span className="t-meta font-semibold tabular-nums text-text-muted">{entries.length}</span>
      </h2>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => <LeaveCard key={entry.id} entry={entry} onRemove={onRemove} busy={removing === entry.id} />)}
      </ul>
    </section>
  );

export const LeavePage = () => {
  const confirm = useConfirm();
  const today = useOrgToday();
  const { data, isPending, isError, refetch } = useLeaveQuery();
  const removeMut = useRemoveLeaveMutation();
  const [showForm, setShowForm] = useState(false);

  const groups = useMemo(() => {
    const all = data ?? [];
    return {
      now: all.filter((e) => e.startDate <= today && e.endDate >= today),
      coming: all.filter((e) => e.startDate > today),
      recent: all.filter((e) => e.endDate < today).reverse(),
    };
  }, [data, today]);

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

  const empty = !isPending && !isError && (data?.length ?? 0) === 0;

  return (
    <div className="mx-auto flex w-full max-w-(--container-width) flex-col gap-3 pt-2.5 sm:gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="t-section font-display font-bold text-text">Leave</h1>
          <p className="hidden t-meta font-display text-text-muted sm:block">People on leave are skipped for checklists, so their score does not drop.</p>
        </div>
        <CreateButton label="Record leave" onClick={() => setShowForm(true)} className="hidden md:inline-flex" />
      </div>

      {isPending && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      )}

      {isError && <InlineError message="We couldn't load the leave list. Check your connection and try again." onRetry={() => { void refetch(); }} />}

      {empty && (
        <EmptyState
          icon={CalendarOff}
          title="Nobody is on leave"
          description="Record leave when someone is away on a working day, so their checklists are skipped and their score stays fair."
          action={{ label: 'Record leave', icon: Plus, onClick: () => setShowForm(true) }}
        />
      )}

      <Group title="On leave now" entries={groups.now} onRemove={(e) => { void remove(e); }} removing={removeMut.isPending ? removeMut.variables ?? null : null} />
      <Group title="Coming up" entries={groups.coming} onRemove={(e) => { void remove(e); }} removing={removeMut.isPending ? removeMut.variables ?? null : null} />
      <Group title="Last 30 days" entries={groups.recent} onRemove={(e) => { void remove(e); }} removing={removeMut.isPending ? removeMut.variables ?? null : null} />

      <Fab sheetTitle="Create" actions={[{ key: 'leave', label: 'Record leave', description: 'Skip their checklists for the days they are away', icon: CalendarOff, onClick: () => setShowForm(true) }]} />

      {showForm && <LeaveForm onClose={() => setShowForm(false)} />}
    </div>
  );
};
