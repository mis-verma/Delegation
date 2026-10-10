import { useMemo } from 'react';
import { Link } from 'react-router';
import { BellRing, CheckCheck, ChevronRight, ClipboardList, ListChecks, ListTodo, TicketCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../components/entityCard';
import { instanceDeadline, isInstanceOverdue } from '../checklist/checklistDisplay';
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

interface FocusNowCardProps {
  /** Delegations assigned to this person. */
  tasks: Task[];
  /** Tickets assigned to this person. */
  tickets: Ticket[];
  checklists: ChecklistInstance[];
  todos: Todo[];
  now: number;
}

/**
 * "What do I do now": one short list of the person's own work that needs them, most urgent first, each row
 * one tap from the item. Sent back and overdue in red, ready to submit in orange, due today in blue. When
 * nothing needs them it says so plainly, so the dashboard always answers "am I on track".
 */
export const FocusNowCard = ({ tasks, tickets, checklists, todos, now }: FocusNowCardProps) => {
  const items = useMemo(() => {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const end = endOfDay.getTime();
    const out: FocusItem[] = [];

    for (const c of checklists) {
      const done = c.items.length > 0 && c.items.every((i) => i.isDone);
      const deadline = instanceDeadline(c);
      if (c.verificationStatus === 'REJECTED') {
        out.push({ key: `c-${c.id}`, icon: ListChecks, title: c.title, reason: 'sentBack', at: deadline, detail: 'Fix the marked questions and send again', href: `/checklists/${c.id}` });
      } else if (done && c.verificationStatus === 'NOT_SUBMITTED') {
        out.push({ key: `c-${c.id}`, icon: ListChecks, title: c.title, reason: 'submit', at: deadline, detail: 'All done, send it for approval', href: `/checklists/${c.id}` });
      } else if (!done && isInstanceOverdue(c, done)) {
        out.push({ key: `c-${c.id}`, icon: ListChecks, title: c.title, reason: 'overdue', at: deadline, detail: `Checklist, ${ago(deadline, now)}`, href: `/checklists/${c.id}` });
      } else if (!done && deadline <= end) {
        out.push({ key: `c-${c.id}`, icon: ListChecks, title: c.title, reason: 'dueToday', at: deadline, detail: `Checklist, by ${time(deadline)}`, href: `/checklists/${c.id}` });
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

  const urgent = items.filter((i) => i.reason === 'sentBack' || i.reason === 'overdue').length;
  const shown = items.slice(0, SHOW);

  if (items.length === 0) {
    return (
      <section aria-label="Do now" className={cn(PANEL_CLASS, 'flex items-center gap-3 p-4 border-success/30 bg-success/5')}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
          <CheckCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="t-card font-display font-bold text-text">You're on track</h2>
          <p className="t-meta text-text-muted">Nothing is overdue or due today. Nice work.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden', urgent > 0 ? 'border-danger/30' : 'border-primary-500/30')}>
      <div className={cn('flex items-center gap-3 px-4 py-3', urgent > 0 ? 'bg-danger/[0.07]' : 'bg-primary-500/[0.06]')}>
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-white', urgent > 0 ? 'bg-danger' : 'bg-primary-600')}>
          <BellRing className="size-5 motion-safe:animate-[bell-ring_1.2s_ease-in-out_1]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="focus-now-heading" className="t-card font-display font-bold text-text">
            {items.length} {items.length === 1 ? 'thing needs' : 'things need'} you
          </h2>
          <p className={cn('t-meta font-medium', urgent > 0 ? 'text-danger' : 'text-text-muted')}>
            {urgent > 0 ? `${urgent} ${urgent === 1 ? 'is' : 'are'} late or sent back. Start there.` : 'All due today. Do these first.'}
          </p>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-border/60">
        {shown.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                viewTransition
                to={item.href}
                className="group flex min-h-14 items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-surface-hover/50 active:bg-surface-hover focus-visible:bg-surface-hover"
              >
                <Icon className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-display font-semibold text-text">{item.title}</span>
                  <span className="block truncate t-meta text-text-muted">{item.detail}</span>
                </span>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 t-meta font-display font-semibold', REASON_TONE[item.reason])}>{REASON_LABEL[item.reason]}</span>
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
