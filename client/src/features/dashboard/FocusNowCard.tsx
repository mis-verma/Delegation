import { Fragment, useMemo } from 'react';
import { Link } from 'react-router';
import { AlarmClockOff, CheckCheck, Clock3, RotateCw, Send, Undo2 } from 'lucide-react';
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
import { haptic } from '../../lib/haptics';
import { useIsMobile } from '../../lib/useMediaQuery';
import { QuickAction } from '../../components/layout/quickSheet/QuickRow';
import { useTaskStatusMove } from '../tasks/useTaskStatusMove';
import { useTicketStatusMove } from '../tickets/useTicketStatusMove';
import { useUpdateTodoMutation } from '../todo/hook';
import type { RestrictedStatus } from '../../api/ticket';
import { DashCardHeader, DashCardLink } from './DashCardHeader';
import { useApprovalSources } from './useApprovalSources';

type Reason = 'sentBack' | 'overdue' | 'submit' | 'dueToday';

interface FocusItem {
  key: string;
  category: ActivityCategory;
  title: string;
  reason: Reason;
  at: number;
  detail: string | null;
  href: string;
  task?: Task;
  ticket?: Ticket;
  todo?: Todo;
  checklist?: { label: string };
}

const TASK_NEXT: Partial<Record<Task['status'], { label: string; to: Task['status'] }>> = {
  todo: { label: 'Start', to: 'in_progress' },
  in_progress: { label: 'Complete', to: 'pending_approval' },
  on_hold: { label: 'Resume', to: 'in_progress' },
};

const TICKET_NEXT: Partial<Record<Ticket['status'], { label: string; to: RestrictedStatus }>> = {
  OPEN: { label: 'Start', to: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Complete', to: 'PENDING_APPROVAL' },
  ON_HOLD: { label: 'Resume', to: 'IN_PROGRESS' },
};

const ORDER: Record<Reason, number> = { sentBack: 0, overdue: 1, submit: 2, dueToday: 3 };
const SHOW_DESKTOP = 5;
const SHOW_PHONE = 3;

const LIST_HREF: Record<ActivityCategory, string> = { checklist: '/checklists', delegation: '/tasks', ticket: '/tickets', todo: '/todo' };

const REASON_LABEL: Record<Reason, string> = { sentBack: 'Sent back to you', overdue: 'Late', submit: 'Ready to submit', dueToday: 'Due today' };
const REASON_TEXT: Record<Reason, string> = { sentBack: 'text-vivid-red-text', overdue: 'text-vivid-red-text', submit: 'text-vivid-sky-text', dueToday: 'text-vivid-blue-text' };

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

interface FocusNowCardProps {
  ownWorkOnly?: boolean;
  hideApprovals?: boolean;
  todayChecklist?: { total: number; completed: number } | null;
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
    <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="size-9 rounded-lg" />
    </div>
    <div className="flex flex-col divide-y divide-border/60">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
          <Skeleton className="h-9 w-16 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  </section>
);

export const FocusNowCard = ({ ownWorkOnly = false, hideApprovals = false, todayChecklist = null, tasks, tickets, checklists, todos, now, isPending = false, isError = false, onRetry, updatedAt, onRefresh, isRefreshing }: FocusNowCardProps) => {
  const taskMove = useTaskStatusMove();
  const ticketMove = useTicketStatusMove();
  const todoUpdate = useUpdateTodoMutation();
  const isMobile = useIsMobile();
  const approvals = useApprovalSources();
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
        out.push({ key: `c-${c.id}`, category: 'checklist', title: c.title, reason: 'sentBack', at: deadline, detail: 'Fix the marked questions and send again', href: `/checklists/${c.id}`, checklist: { label: 'Fix' } });
      } else if (done && c.verificationStatus === 'NOT_SUBMITTED') {
        out.push({ key: `c-${c.id}`, category: 'checklist', title: c.title, reason: 'submit', at: deadline, detail: 'All done, send it for approval', href: `/checklists/${c.id}`, checklist: { label: 'Submit' } });
      } else if (!done && isInstanceOverdue(c, done)) {
        out.push({ key: `c-${c.id}`, category: 'checklist', title: c.title, reason: 'overdue', at: deadline, detail: null, href: `/checklists/${c.id}`, checklist: { label: 'Fill' } });
      } else if (!done && deadline <= end) {
        out.push({ key: `c-${c.id}`, category: 'checklist', title: c.title, reason: 'dueToday', at: deadline, detail: null, href: `/checklists/${c.id}`, checklist: { label: 'Fill' } });
      }
    }

    for (const t of tasks) {
      if (t.status === 'done' || t.status === 'draft' || t.status === 'pending_approval' || t.awaitingHeadApproval || !t.dueDate) continue;
      const due = new Date(t.dueDate).getTime();
      if (isTaskOverdue(t, now)) out.push({ key: `t-${t.id}`, category: 'delegation', title: t.title, reason: 'overdue', at: due, detail: null, href: `/tasks?open=${t.id}`, task: t });
      else if (due <= end) out.push({ key: `t-${t.id}`, category: 'delegation', title: t.title, reason: 'dueToday', at: due, detail: null, href: `/tasks?open=${t.id}`, task: t });
    }

    for (const k of tickets) {
      if (isTicketHandedIn(k) || k.awaitingHeadApproval || k.declinedAt) continue;
      const due = k.tatDueAt ? new Date(k.tatDueAt).getTime() : null;
      if (isTicketLate(k)) out.push({ key: `k-${k.id}`, category: 'ticket', title: k.title, reason: 'overdue', at: due ?? 0, detail: due ? null : 'Past its time', href: `/tickets?open=${k.id}`, ticket: k });
      else if (due !== null && due <= end) out.push({ key: `k-${k.id}`, category: 'ticket', title: k.title, reason: 'dueToday', at: due, detail: null, href: `/tickets?open=${k.id}`, ticket: k });
    }

    for (const d of todos) {
      if (d.completed || !d.dueDate) continue;
      const due = new Date(d.dueDate).getTime();
      if (due < now) out.push({ key: `d-${d.id}`, category: 'todo', title: d.text, reason: 'overdue', at: due, detail: null, href: '/todo', todo: d });
      else if (due <= end) out.push({ key: `d-${d.id}`, category: 'todo', title: d.text, reason: 'dueToday', at: due, detail: null, href: '/todo', todo: d });
    }

    return out.sort((a, b) => ORDER[a.reason] - ORDER[b.reason] || a.at - b.at);
  }, [tasks, tickets, checklists, todos, now]);

  if (isPending) return <FocusSkeleton />;

  const count = (reason: Reason) => items.filter((i) => i.reason === reason).length;
  const otherDue = items.filter((i) => i.category !== 'checklist').length;
  const planned = (todayChecklist?.total ?? 0) + otherDue;
  const percent = todayChecklist && planned > 0 ? Math.round(((todayChecklist.completed ?? 0) / planned) * 100) : null;
  const lateCount = count('overdue');
  const sentBackCount = count('sentBack');
  const submitCount = count('submit');
  const todayCount = count('dueToday');
  const urgent = lateCount + sentBackCount;
  const updated = updatedAt ? <span className="t-meta text-text-muted tabular-nums">Updated {time(updatedAt)}</span> : null;
  const refresh = onRefresh && (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      aria-label="Refresh the dashboard"
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-default disabled:opacity-50 pointer-fine:size-9"
    >
      <RotateCw className={cn('size-4', isRefreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
    </button>
  );
  const limit = isMobile ? SHOW_PHONE : SHOW_DESKTOP;
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const restHref = (() => {
    if (rest.length === 0) return null;
    const tally = new Map<ActivityCategory, number>();
    for (const i of rest) tally.set(i.category, (tally.get(i.category) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    return { href: LIST_HREF[top], label: ACTIVITY_CATEGORY_LABEL[top] };
  })();
  const nextUp = items.filter((i) => i.reason === 'dueToday' && i.at > now).sort((a, b) => a.at - b.at)[0];
  const nextUpHidden = nextUp && !shown.includes(nextUp) ? nextUp : null;

  const approvalsLine = ownWorkOnly && !hideApprovals && approvals.queueHref && approvals.total > 0 && (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2 sm:px-5">
      <p className="t-meta font-medium text-text-secondary tabular-nums">
        {approvals.total} {approvals.total === 1 ? 'approval' : 'approvals'} waiting
      </p>
      <DashCardLink to={approvals.queueHref} label={`Open the approval queue, ${approvals.total} waiting`}>Open queue</DashCardLink>
    </div>
  );

  const actionFor = (item: FocusItem) => {
    if (item.checklist) return <QuickAction label={item.checklist.label} to={item.href} />;
    if (item.todo) {
      const todo = item.todo;
      return <QuickAction label="Done" onClick={() => { haptic('tap'); todoUpdate.mutate({ id: todo.id, payload: { completed: true } }); }} />;
    }
    if (item.task) {
      const task = item.task;
      const next = TASK_NEXT[task.status];
      return next ? <QuickAction label={next.label} onClick={() => { haptic('tap'); taskMove.requestMove(task, next.to); }} /> : null;
    }
    if (item.ticket) {
      const ticket = item.ticket;
      const next = TICKET_NEXT[ticket.status];
      return next ? <QuickAction label={next.label} onClick={() => { haptic('tap'); ticketMove.requestMove(ticket, next.to); }} /> : null;
    }
    return null;
  };

  if (items.length === 0) {
    if (isError) {
      return (
        <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
          <DashCardHeader id="focus-now-heading" title="Do now" action={refresh} />
          <div className="px-4 py-3 sm:px-5">
            <InlineError message="Couldn't load your work, so we can't say what needs you yet." onRetry={onRetry} />
          </div>
        </section>
      );
    }
    return (
      <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
        <DashCardHeader id="focus-now-heading" title={ownWorkOnly ? 'Your own work is on track' : "You're on track"} action={refresh} />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5">
          <p className="flex min-w-0 items-center gap-1.5 t-meta font-medium text-text-secondary">
            <CheckCheck className="size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden="true" />
            <span className="tabular-nums">Nothing is overdue or due today.{percent !== null && ` Today ${percent}% done.`}</span>
          </p>
          <DashCardLink to="/todo">Plan in To-Do</DashCardLink>
        </div>
        {approvalsLine}
      </section>
    );
  }

  return (
    <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      <DashCardHeader
        id="focus-now-heading"
        title="Do now"
        count={items.length}
        countLabel={`${items.length} ${items.length === 1 ? 'thing needs' : 'things need'} you`}
        alert={urgent > 0}
        subtitle={urgent > 0 ? `${urgent} ${urgent === 1 ? 'is' : 'are'} late or sent back. Start there.` : 'All due today. Do these first.'}
        action={refresh}
      />
      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {lateCount > 0 && <IconChip icon={AlarmClockOff} tone="bg-vivid-red" label={`${lateCount} late`} labelClassName="tabular-nums text-vivid-red-text" className="border-vivid-red/40 bg-vivid-red/10" />}
        {sentBackCount > 0 && <IconChip icon={Undo2} tone="bg-vivid-red" label={`${sentBackCount} sent back`} labelClassName="tabular-nums text-vivid-red-text" className="border-vivid-red/40 bg-vivid-red/10" />}
        {submitCount > 0 && <IconChip icon={Send} tone="bg-vivid-sky" label={`${submitCount} to submit`} labelClassName="tabular-nums text-vivid-sky-text" className="border-vivid-sky/40 bg-vivid-sky/10" />}
        {todayCount > 0 && <IconChip icon={Clock3} tone="bg-vivid-blue" label={`${todayCount} due today`} labelClassName="tabular-nums text-vivid-blue-text" className="border-vivid-blue/40 bg-vivid-blue/10" />}
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {percent !== null && <span className="t-meta font-semibold tabular-nums text-text-secondary">Today {percent}% done</span>}
          {updated && <span className="hidden sm:inline">{updated}</span>}
        </span>
      </div>
      {isError && (
        <div className="px-4 pb-3 sm:px-5">
          <InlineError message="Some of your work didn't load, so this list may be missing items." onRetry={onRetry} />
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border/60 border-t border-border/60">
        {shown.map((item, index) => {
          const Icon = CATEGORY_ICON[item.category];
          const hot = item.reason === 'sentBack' || item.reason === 'overdue';
          const startsGroup = index === 0 || shown[index - 1]!.reason !== item.reason;
          return (
            <Fragment key={item.key}>
            {startsGroup && (
              <li className="flex items-center gap-2 bg-surface-hover/40 px-4 py-1.5 sm:px-5">
                <h3 className={cn('t-meta font-display font-bold', REASON_TEXT[item.reason])}>{REASON_LABEL[item.reason]}</h3>
                <span className="t-meta font-semibold tabular-nums text-text-muted">{count(item.reason)}</span>
              </li>
            )}
            <li className={cn('flex items-center gap-2 pr-4 transition-colors duration-150 hover:bg-surface-hover/50 sm:pr-5', hot && 'bg-danger/5')}>
              <Link
                viewTransition
                to={item.href}
                className="group flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 outline-none transition-colors duration-150 active:bg-surface-hover focus-visible:bg-surface-hover sm:pl-5"
              >
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl text-white', CATEGORY_TILE[item.category])}>
                  <Icon className="size-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="line-clamp-2 leading-snug t-card font-display font-semibold text-text">{item.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 t-meta font-display font-semibold', CATEGORY_PILL[item.category])}>{ACTIVITY_CATEGORY_LABEL[item.category]}</span>
                    {item.at > 0 && <DueChip at={item.at} now={now} />}
                  </span>
                  {item.detail && <span className="line-clamp-2 t-meta text-text-muted max-sm:hidden">{item.detail}</span>}
                </span>
              </Link>
              {actionFor(item)}
            </li>
            </Fragment>
          );
        })}
      </ul>
      {taskMove.statusRemarkDialog}
      {ticketMove.statusRemarkDialog}
      {(restHref || nextUpHidden) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 px-4 py-2 sm:px-5">
          <p className="flex min-w-0 flex-1 flex-col gap-0.5 t-meta font-medium text-text-secondary">
            {rest.length > 0 && <span className="tabular-nums">{rest.length} more not shown</span>}
            {nextUpHidden && <span className="line-clamp-1">Next up: {nextUpHidden.title}</span>}
          </p>
          {restHref && (
            <DashCardLink to={restHref.href} label={`Open all, ${rest.length} more not shown, starting with ${restHref.label}`}>Open all</DashCardLink>
          )}
        </div>
      )}
      {approvalsLine}
    </section>
  );
};
