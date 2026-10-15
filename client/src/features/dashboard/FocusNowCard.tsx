import { useMemo } from 'react';
import { Link } from 'react-router';
import { BellRing, CheckCheck, ChevronRight, ClipboardCheck, ClipboardList, ListTodo, RotateCw, TicketCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../components/entityCard';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { instanceDeadline, isInstanceEnded, isInstanceOverdue } from '../checklist/checklistDisplay';
import { isTaskOverdue, isTicketLate } from './dashboardDisplay';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import type { Todo } from '../../api/todos';
import type { ChecklistInstance } from '../../api/checklistInstances';

type Reason = 'sentBack' | 'overdue' | 'submit' | 'dueToday';

interface FocusItem {
  key: string;
  icon: LucideIcon;
  title: string;
  reason: Reason;
  /** Sorts within a reason: earliest first. */
  at: number;
  detail: string;
  href: string;
}

// What to deal with first: work handed back, then late work, then finished checklists waiting to be
// sent, then what is due before the day ends.
const ORDER: Record<Reason, number> = { sentBack: 0, overdue: 1, submit: 2, dueToday: 3 };
const REASON_LABEL: Record<Reason, string> = { sentBack: 'Sent back', overdue: 'Overdue', submit: 'Ready to submit', dueToday: 'Due today' };
const REASON_TONE: Record<Reason, string> = {
  sentBack: 'bg-danger/10 text-danger',
  overdue: 'bg-danger/10 text-danger',
  submit: 'bg-warning/10 text-warning',
  dueToday: 'bg-primary-500/10 text-primary-700 dark:text-primary-300',
};
const SHOW = 6;

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const ago = (ms: number, now: number) => {
  const hours = Math.floor((now - ms) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h late`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} late`;
};

// Same soft tile every dashboard card header uses (see CARD_ICON_TILE_CLASS), but always shown: here
// its colour is the signal (red when something is late, green when nothing is waiting).
const TILE_CLASS = 'flex size-11 shrink-0 items-center justify-center rounded-xl text-white';
const TILE_DANGER = 'bg-linear-to-br from-danger to-danger/70';
const TILE_SUCCESS = 'bg-linear-to-br from-success to-success/70';
const TILE_PRIMARY = 'bg-linear-to-br from-primary-500 to-primary-600';

interface FocusNowCardProps {
  /** Delegations assigned to this person. */
  tasks: Task[];
  /** Tickets assigned to this person. */
  tickets: Ticket[];
  checklists: ChecklistInstance[];
  todos: Todo[];
  now: number;
  /** True until every list this card reads has arrived. Shows skeleton rows, never "on track". */
  isPending?: boolean;
  /** A list failed to load, so the card cannot honestly say nothing is waiting. */
  isError?: boolean;
  onRetry?: () => void;
  /** When the counts last arrived (ms), shown as "Updated 10:42" under the heading. */
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

/**
 * "What do I do now": one short list of the person's own work that needs them, most urgent first, each row
 * one tap from the item. Sent back and overdue in red, ready to submit in orange, due today in blue. When
 * nothing needs them it says so plainly, so the dashboard always answers "am I on track". It only says so
 * once every list has loaded: while loading it shows skeleton rows, and after a failure it shows the error.
 */
export const FocusNowCard = ({ tasks, tickets, checklists, todos, now, isPending = false, isError = false, onRetry, updatedAt, onRefresh, isRefreshing }: FocusNowCardProps) => {
  const items = useMemo(() => {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const end = endOfDay.getTime();
    const out: FocusItem[] = [];

    for (const c of checklists) {
      // A run that has ended is closed to its people: it never needs them (the server leaves it out too).
      if (isInstanceEnded(c, now)) continue;
      const done = c.items.length > 0 && c.items.every((i) => i.isDone);
      const deadline = instanceDeadline(c);
      if (c.verificationStatus === 'REJECTED') {
        out.push({ key: `c-${c.id}`, icon: ClipboardCheck, title: c.title, reason: 'sentBack', at: deadline, detail: 'Fix the marked questions and send again', href: `/checklists/${c.id}` });
      } else if (done && c.verificationStatus === 'NOT_SUBMITTED') {
        out.push({ key: `c-${c.id}`, icon: ClipboardCheck, title: c.title, reason: 'submit', at: deadline, detail: 'All done, send it for approval', href: `/checklists/${c.id}` });
      } else if (!done && isInstanceOverdue(c, done)) {
        out.push({ key: `c-${c.id}`, icon: ClipboardCheck, title: c.title, reason: 'overdue', at: deadline, detail: `Checklist, ${ago(deadline, now)}`, href: `/checklists/${c.id}` });
      } else if (!done && deadline <= end) {
        out.push({ key: `c-${c.id}`, icon: ClipboardCheck, title: c.title, reason: 'dueToday', at: deadline, detail: `Checklist, by ${time(deadline)}`, href: `/checklists/${c.id}` });
      }
    }

    for (const t of tasks) {
      if (t.status === 'done' || t.status === 'draft' || t.status === 'pending_approval' || !t.dueDate) continue;
      const due = new Date(t.dueDate).getTime();
      if (isTaskOverdue(t, now)) out.push({ key: `t-${t.id}`, icon: ClipboardList, title: t.title, reason: 'overdue', at: due, detail: `Delegation, ${ago(due, now)}`, href: `/tasks?open=${t.id}` });
      else if (due <= end) out.push({ key: `t-${t.id}`, icon: ClipboardList, title: t.title, reason: 'dueToday', at: due, detail: `Delegation, by ${time(due)}`, href: `/tasks?open=${t.id}` });
    }

    for (const k of tickets) {
      if (k.status === 'CLOSED') continue;
      const due = k.tatDueAt ? new Date(k.tatDueAt).getTime() : null;
      if (isTicketLate(k)) out.push({ key: `k-${k.id}`, icon: TicketCheck, title: k.title, reason: 'overdue', at: due ?? 0, detail: `Ticket, ${due ? ago(due, now) : 'past its time'}`, href: `/tickets?open=${k.id}` });
      else if (due !== null && due <= end) out.push({ key: `k-${k.id}`, icon: TicketCheck, title: k.title, reason: 'dueToday', at: due, detail: `Ticket, by ${time(due)}`, href: `/tickets?open=${k.id}` });
    }

    for (const d of todos) {
      if (d.completed || !d.dueDate) continue;
      const due = new Date(d.dueDate).getTime();
      if (due < now) out.push({ key: `d-${d.id}`, icon: ListTodo, title: d.text, reason: 'overdue', at: due, detail: `To-do, ${ago(due, now)}`, href: '/todo' });
      else if (due <= end) out.push({ key: `d-${d.id}`, icon: ListTodo, title: d.text, reason: 'dueToday', at: due, detail: `To-do, by ${time(due)}`, href: '/todo' });
    }

    return out.sort((a, b) => ORDER[a.reason] - ORDER[b.reason] || a.at - b.at);
  }, [tasks, tickets, checklists, todos, now]);

  if (isPending) return <FocusSkeleton />;

  const urgent = items.filter((i) => i.reason === 'sentBack' || i.reason === 'overdue').length;
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
    // Nothing found, but a list failed: say that instead of "on track", which might not be true.
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
          {/* The sentence and "Updated 16:49" share a wrapping row: on a phone that is two short lines
              instead of three, and "Nice work." only appears where there is room for it. */}
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
          <h2 id="focus-now-heading" className="t-section font-display font-bold text-text">
            {items.length} {items.length === 1 ? 'thing needs' : 'things need'} you
          </h2>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className={cn('t-meta font-medium', urgent > 0 ? 'text-danger' : 'text-text-muted')}>
              {urgent > 0 ? `${urgent} ${urgent === 1 ? 'is' : 'are'} late or sent back.` : 'All due today.'}
              <span className="hidden sm:inline">{urgent > 0 ? ' Start there.' : ' Do these first.'}</span>
            </p>
            {updated}
          </div>
        </div>
        {refresh}
      </div>
      {error}

      <ul className="flex flex-col divide-y divide-border/60 border-t border-border/60">
        {shown.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                viewTransition
                to={item.href}
                className="group flex min-h-16 items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-surface-hover/50 active:bg-surface-hover focus-visible:bg-surface-hover"
              >
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', REASON_TONE[item.reason])}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* The title has the row to itself and wraps to two lines; the reason chip sits on the
                      line under it, beside the detail, so it no longer cuts the title short. */}
                  <span className="line-clamp-2 leading-snug text-sm font-display font-medium sm:font-semibold text-text">{item.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 t-meta font-display font-semibold', REASON_TONE[item.reason])}>{REASON_LABEL[item.reason]}</span>
                    <span className="min-w-0 t-meta text-text-muted">{item.detail}</span>
                  </span>
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
