import { useMemo } from 'react';
import { Link } from 'react-router';
import { AlarmClockOff, BellRing, CheckCheck, ChevronRight, Clock3, RotateCw, Send, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../components/entityCard';
import { DueChip } from '../../components/dueChip';
import { IconChip } from '../../components/iconChip';
import { CATEGORY_ICON, CATEGORY_PILL, CATEGORY_TILE } from './categoryLook';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { instanceDeadline, isInstanceEnded, isInstanceOverdue } from '../checklist/checklistDisplay';
import { ACTIVITY_CATEGORY_LABEL, isTaskOverdue, isTicketLate, type ActivityCategory } from './dashboardDisplay';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import type { Todo } from '../../api/todos';
import type { ChecklistInstance } from '../../api/checklistInstances';
import { isTicketHandedIn } from '../../lib/handedIn';

type Reason = 'sentBack' | 'overdue' | 'submit' | 'dueToday';

interface FocusItem {
  key: string;
  category: ActivityCategory;
  title: string;
  reason: Reason;
  at: number;
  detail: string | null;
  href: string;
}

const ORDER: Record<Reason, number> = { sentBack: 0, overdue: 1, submit: 2, dueToday: 3 };
const SHOW = 6;

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

const TILE_CLASS = 'flex size-11 shrink-0 items-center justify-center rounded-xl text-white';
const TILE_DANGER = 'bg-linear-to-br from-danger to-danger/70';
const TILE_SUCCESS = 'bg-linear-to-br from-success to-success/70';
const TILE_PRIMARY = 'bg-linear-to-br from-primary-500 to-primary-600';

interface FocusNowCardProps {
  tasks: Task[];
  tickets: Ticket[];
  checklists: ChecklistInstance[];
  todos: Todo[];
  now: number;
  isPending?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  updatedAt?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const FocusSkeleton = () => (
  <section aria-label="Loading what needs you" role="status" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-11 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3.5 w-20" />
      </div>
    </div>
    <div className="flex flex-col divide-y divide-border/60 border-t border-border/60">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
          <Skeleton className="size-4 shrink-0 rounded" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </section>
);

export const FocusNowCard = ({ tasks, tickets, checklists, todos, now, isPending = false, isError = false, onRetry, updatedAt, onRefresh, isRefreshing }: FocusNowCardProps) => {
  const items = useMemo(() => {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const end = endOfDay.getTime();
    const out: FocusItem[] = [];

    for (const c of checklists) {
      if (isInstanceEnded(c, now)) continue;
      const done = c.items.length > 0 && c.items.every((i) => i.isDone);
      const deadline = instanceDeadline(c);
      if (c.verificationStatus === 'REJECTED') {
        out.push({ key: `c-${c.id}`, category: 'checklist', title: c.title, reason: 'sentBack', at: deadline, detail: 'Fix the marked questions and send again', href: `/checklists/${c.id}` });
      } else if (done && c.verificationStatus === 'NOT_SUBMITTED') {
        out.push({ key: `c-${c.id}`, category: 'checklist', title: c.title, reason: 'submit', at: deadline, detail: 'All done, send it for approval', href: `/checklists/${c.id}` });
      } else if (!done && isInstanceOverdue(c, done)) {
        out.push({ key: `c-${c.id}`, category: 'checklist', title: c.title, reason: 'overdue', at: deadline, detail: null, href: `/checklists/${c.id}` });
      } else if (!done && deadline <= end) {
        out.push({ key: `c-${c.id}`, category: 'checklist', title: c.title, reason: 'dueToday', at: deadline, detail: null, href: `/checklists/${c.id}` });
      }
    }

    for (const t of tasks) {
      if (t.status === 'done' || t.status === 'draft' || t.status === 'pending_approval' || t.awaitingHeadApproval || !t.dueDate) continue;
      const due = new Date(t.dueDate).getTime();
      if (isTaskOverdue(t, now)) out.push({ key: `t-${t.id}`, category: 'delegation', title: t.title, reason: 'overdue', at: due, detail: null, href: `/tasks?open=${t.id}` });
      else if (due <= end) out.push({ key: `t-${t.id}`, category: 'delegation', title: t.title, reason: 'dueToday', at: due, detail: null, href: `/tasks?open=${t.id}` });
    }

    for (const k of tickets) {
      if (isTicketHandedIn(k) || k.awaitingHeadApproval || k.declinedAt) continue;
      const due = k.tatDueAt ? new Date(k.tatDueAt).getTime() : null;
      if (isTicketLate(k)) out.push({ key: `k-${k.id}`, category: 'ticket', title: k.title, reason: 'overdue', at: due ?? 0, detail: due ? null : 'Past its time', href: `/tickets?open=${k.id}` });
      else if (due !== null && due <= end) out.push({ key: `k-${k.id}`, category: 'ticket', title: k.title, reason: 'dueToday', at: due, detail: null, href: `/tickets?open=${k.id}` });
    }

    for (const d of todos) {
      if (d.completed || !d.dueDate) continue;
      const due = new Date(d.dueDate).getTime();
      if (due < now) out.push({ key: `d-${d.id}`, category: 'todo', title: d.text, reason: 'overdue', at: due, detail: null, href: '/todo' });
      else if (due <= end) out.push({ key: `d-${d.id}`, category: 'todo', title: d.text, reason: 'dueToday', at: due, detail: null, href: '/todo' });
    }

    return out.sort((a, b) => ORDER[a.reason] - ORDER[b.reason] || a.at - b.at);
  }, [tasks, tickets, checklists, todos, now]);

  if (isPending) return <FocusSkeleton />;

  const count = (reason: Reason) => items.filter((i) => i.reason === reason).length;
  const lateCount = count('overdue');
  const sentBackCount = count('sentBack');
  const submitCount = count('submit');
  const todayCount = count('dueToday');
  const urgent = lateCount + sentBackCount;
  const updated = updatedAt ? <p className="t-meta text-text-muted tabular-nums">Updated {time(updatedAt)}</p> : null;
  const refresh = onRefresh && (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      aria-label="Refresh the dashboard"
      className="ml-auto inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
    >
      <RotateCw className={cn('size-4', isRefreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
    </button>
  );
  const shown = items.slice(0, SHOW);
  const error = isError && (
    <div className="px-4 pb-3">
      <InlineError message="Some of your work didn't load, so this list may be missing items." onRetry={onRetry} />
    </div>
  );

  if (items.length === 0) {
    if (isError) {
      return (
        <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex flex-col')}>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className={cn(TILE_CLASS, TILE_DANGER)}>
              <BellRing className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="focus-now-heading" className="t-section font-display font-bold text-text">Do now</h2>
              {updated}
            </div>
            {refresh}
          </div>
          <div className="px-4 pb-3">
            <InlineError message="Couldn't load your work, so we can't say what needs you yet." onRetry={onRetry} />
          </div>
        </section>
      );
    }
    return (
      <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex items-center gap-3.5 px-4 py-3.5 border-success/30 bg-linear-to-r from-success/12 via-success/5 to-transparent')}>
        <span className={cn(TILE_CLASS, TILE_SUCCESS)}>
          <CheckCheck className="size-5" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="focus-now-heading" className="t-section font-display font-bold tracking-tight text-text">You're on track</h2>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="t-meta text-text-muted">Nothing is overdue or due today.<span className="hidden sm:inline"> Nice work.</span></p>
            {updated}
          </div>
        </div>
        {refresh}
      </section>
    );
  }

  return (
    <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden', urgent > 0 ? 'border-danger/30' : 'border-primary-500/30')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={cn(TILE_CLASS, urgent > 0 ? TILE_DANGER : TILE_PRIMARY)}>
          <BellRing className="size-5 motion-safe:animate-[bell-ring_1.2s_ease-in-out_1]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id="focus-now-heading" className="t-section font-display font-bold text-text">
              {items.length} {items.length === 1 ? 'thing needs' : 'things need'} you
            </h2>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className={cn('t-meta font-medium', urgent > 0 ? 'text-danger' : 'text-text-muted')}>
              {urgent > 0 ? `${urgent} ${urgent === 1 ? 'is' : 'are'} late or sent back.` : 'All due today.'}
              <span className="hidden sm:inline">{urgent > 0 ? ' Start there.' : ' Do these first.'}</span>
            </p>
            {updated}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lateCount > 0 && <IconChip icon={AlarmClockOff} tone="bg-danger" label={`${lateCount} late`} labelClassName="tabular-nums text-danger" className="border-danger/30 bg-danger/10" />}
            {sentBackCount > 0 && <IconChip icon={Undo2} tone="bg-danger" label={`${sentBackCount} sent back`} labelClassName="tabular-nums text-danger" className="border-danger/30 bg-danger/10" />}
            {submitCount > 0 && <IconChip icon={Send} tone="bg-warning" label={`${submitCount} to submit`} labelClassName="tabular-nums text-warning" className="border-warning/30 bg-warning/10" />}
            {todayCount > 0 && <IconChip icon={Clock3} tone="bg-primary-600" label={`${todayCount} due today`} labelClassName="tabular-nums text-primary-700 dark:text-primary-300" className="border-primary-500/25 bg-primary-500/10" />}
          </div>
        </div>
        {refresh}
      </div>
      {error}

      <ul className="flex flex-col divide-y divide-border/60 border-t border-border/60">
        {shown.map((item) => {
          const Icon = CATEGORY_ICON[item.category];
          const hot = item.reason === 'sentBack' || item.reason === 'overdue';
          return (
            <li key={item.key} className="relative">
              {hot && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-danger" aria-hidden="true" />}
              <Link
                viewTransition
                to={item.href}
                className="group flex min-h-16 items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-surface-hover/50 active:bg-surface-hover focus-visible:bg-surface-hover"
              >
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-white', CATEGORY_TILE[item.category])}>
                  <Icon className="size-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="line-clamp-2 leading-snug text-sm font-display font-medium sm:font-semibold text-text">{item.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 t-meta font-display font-semibold', CATEGORY_PILL[item.category])}>{ACTIVITY_CATEGORY_LABEL[item.category]}</span>
                    {item.reason === 'sentBack' && <IconChip icon={Undo2} tone="bg-danger" label="Sent back" labelClassName="text-danger" className="shrink-0 border-danger/30 bg-danger/10" />}
                    {item.reason === 'submit' && <IconChip icon={Send} tone="bg-warning" label="Ready to submit" labelClassName="text-warning" className="shrink-0 border-warning/30 bg-warning/10" />}
                    {item.at > 0 && <DueChip at={item.at} now={now} />}
                  </span>
                  {item.detail && <span className="line-clamp-2 t-meta text-text-muted">{item.detail}</span>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-text-light transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      {items.length > SHOW && (
        <p className="border-t border-border/60 px-4 py-2.5 t-meta text-text-muted">
          And {items.length - SHOW} more. Finish these first, the next ones move up.
        </p>
      )}
    </section>
  );
};
