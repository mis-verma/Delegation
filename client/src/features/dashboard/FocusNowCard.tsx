import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlarmClockOff, CheckCheck, ChevronDown, Clock3, Hourglass, RotateCw, Send, Undo2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../components/entityCard';
import { dueInfo, type DueLevel } from '../../components/dueChip/dueInfo';
import { Pill, type PillTone } from '../../components/pill';
import { CATEGORY_ICON, CATEGORY_TILE } from './categoryLook';
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
import { DashCardLink } from './DashCardHeader';
import { useApprovalSources } from './useApprovalSources';

type Reason = 'sentBack' | 'overdue' | 'submit' | 'dueToday';
type Filter = 'all' | Reason;

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

interface ReasonMeta {
  short: string;
  tone: PillTone;
  icon: LucideIcon;
  bar: string;
}

const REASON_META: Record<Reason, ReasonMeta> = {
  sentBack: { short: 'Sent back', tone: 'danger', icon: Undo2, bar: 'bg-vivid-red' },
  overdue: { short: 'Late', tone: 'danger', icon: AlarmClockOff, bar: 'bg-vivid-red' },
  submit: { short: 'To submit', tone: 'info', icon: Send, bar: 'bg-vivid-sky' },
  dueToday: { short: 'Due today', tone: 'primary', icon: Clock3, bar: 'bg-primary-600 dark:bg-primary-400' },
};

const REASONS: readonly Reason[] = ['sentBack', 'overdue', 'submit', 'dueToday'];

const DUE_TONE: Record<DueLevel, PillTone> = { late: 'danger', soon: 'primary', today: 'neutral', tomorrow: 'neutral', later: 'neutral' };

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
    <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5">
      <Skeleton className="size-12 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-3.5 w-48" />
      </div>
    </div>
    <div className="flex flex-col divide-y divide-border/60 border-t border-border/60">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-6 w-1/2 rounded-full" />
          </div>
          <Skeleton className="h-9 w-16 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  </section>
);

const RING_SIZE = 48;
const RING_STROKE = 5;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_LEN = 2 * Math.PI * RING_R;

const ProgressRing = ({ percent }: { percent: number }) => {
  const tone = percent >= 80 ? 'text-vivid-green' : percent >= 50 ? 'text-vivid-sky' : 'text-vivid-red';
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span className="relative flex shrink-0 items-center justify-center" role="img" aria-label={`Today ${percent}% done`}>
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90" aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" strokeWidth={RING_STROKE} className="stroke-border/70" />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_LEN}
          strokeDashoffset={RING_LEN * (1 - clamped / 100)}
          className={cn('stroke-current transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none', tone)}
        />
      </svg>
      <span className="absolute t-meta font-display font-bold tabular-nums text-text">{percent}%</span>
    </span>
  );
};

export const FocusNowCard = ({ ownWorkOnly = false, hideApprovals = false, todayChecklist = null, tasks, tickets, checklists, todos, now, isPending = false, isError = false, onRetry, updatedAt, onRefresh, isRefreshing }: FocusNowCardProps) => {
  const taskMove = useTaskStatusMove();
  const ticketMove = useTicketStatusMove();
  const todoUpdate = useUpdateTodoMutation();
  const isMobile = useIsMobile();
  const approvals = useApprovalSources();
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);
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

  const counts: Record<Reason, number> = { sentBack: 0, overdue: 0, submit: 0, dueToday: 0 };
  for (const i of items) counts[i.reason] += 1;
  const otherDue = items.filter((i) => i.category !== 'checklist').length;
  const planned = (todayChecklist?.total ?? 0) + otherDue;
  const percent = todayChecklist && planned > 0 ? Math.round(((todayChecklist.completed ?? 0) / planned) * 100) : null;
  const urgent = counts.overdue + counts.sentBack;
  const activeFilter: Filter = filter !== 'all' && counts[filter] === 0 ? 'all' : filter;
  const filtered = activeFilter === 'all' ? items : items.filter((i) => i.reason === activeFilter);
  const limit = isMobile ? SHOW_PHONE : SHOW_DESKTOP;
  const shown = expanded ? filtered : filtered.slice(0, limit);
  const hidden = filtered.length - shown.length;
  const presentReasons = REASONS.filter((r) => counts[r] > 0);
  const nextUp = items.filter((i) => i.reason === 'dueToday' && i.at > now).sort((a, b) => a.at - b.at)[0];
  const nextUpHidden = nextUp && !shown.includes(nextUp) ? nextUp : null;

  const refresh = onRefresh && (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      aria-label="Refresh the dashboard"
      title={updatedAt ? `Updated ${time(updatedAt)}` : 'Refresh'}
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-default disabled:opacity-50 pointer-fine:size-9"
    >
      <RotateCw className={cn('size-4', isRefreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
    </button>
  );

  const header = (title: string, sentence: string) => (
    <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5">
      {percent !== null && <ProgressRing percent={percent} />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 id="focus-now-heading" className="min-w-0 truncate t-section font-display font-bold tracking-tight text-text">{title}</h2>
          {items.length > 0 && (
            <span
              role="status"
              aria-label={`${items.length} ${items.length === 1 ? 'thing needs' : 'things need'} you`}
              className={cn('inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-2 t-meta font-display font-bold tabular-nums', urgent > 0 ? 'bg-vivid-red/10 text-vivid-red-text' : 'bg-primary-500/10 text-primary-700 dark:text-primary-300')}
            >
              {items.length}
            </span>
          )}
        </div>
        <p className="line-clamp-2 t-meta font-medium text-text-muted">{sentence}</p>
      </div>
      {refresh}
    </div>
  );

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
    return (
      <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
        {header(ownWorkOnly ? 'Your own work' : 'Do now', isError ? "We couldn't check your work yet." : 'Nothing is late or due today.')}
        {isError ? (
          <div className="px-4 pb-4 sm:px-5">
            <InlineError message="Couldn't load your work, so we can't say what needs you yet." onRetry={onRetry} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 border-t border-border/60 px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-vivid-green/10 text-vivid-green-text">
                <CheckCheck className="size-5" strokeWidth={2.5} aria-hidden="true" />
              </span>
              <p className="flex min-w-0 flex-col t-meta font-medium text-text-secondary">
                <span className="t-card font-display font-semibold text-text">All clear</span>
                <span>New work shows up here when it needs you.</span>
              </p>
            </div>
            <DashCardLink to="/todo">Plan in To-Do</DashCardLink>
          </div>
        )}
        {approvalsLine}
      </section>
    );
  }

  const sentence = urgent > 0
    ? `${urgent} ${urgent === 1 ? 'is' : 'are'} late or sent back. Start there.`
    : `${items.length} ${items.length === 1 ? 'thing is' : 'things are'} due today.`;

  return (
    <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      {header('Do now', sentence)}

      {presentReasons.length > 1 && (
        <div role="radiogroup" aria-label="Filter what needs you" className="flex gap-1.5 overflow-x-auto px-4 pb-3 sm:flex-wrap sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(['all', ...presentReasons] as Filter[]).map((key) => {
            const on = activeFilter === key;
            const count = key === 'all' ? items.length : counts[key];
            const label = key === 'all' ? 'All' : REASON_META[key].short;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => { haptic('tap'); setFilter(key); setExpanded(false); }}
                className={cn(
                  'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 t-meta font-display font-semibold outline-none ring-1 ring-inset transition-colors duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/60 pointer-fine:min-h-8',
                  on ? 'bg-primary-800 text-white ring-transparent dark:bg-primary-500' : 'bg-surface text-text-secondary ring-border hover:bg-surface-hover hover:text-text',
                )}
              >
                {label}
                <span className={cn('tabular-nums', on ? 'text-white/80' : 'text-text-muted')}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {isError && (
        <div className="px-4 pb-3 sm:px-5">
          <InlineError message="Some of your work didn't load, so this list may be missing items." onRetry={onRetry} />
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border/60 border-t border-border/60">
        {shown.map((item) => {
          const Icon = CATEGORY_ICON[item.category];
          const meta = REASON_META[item.reason];
          const hot = item.reason === 'sentBack' || item.reason === 'overdue';
          const due = item.at > 0 ? dueInfo(item.at, now) : null;
          return (
            <li key={item.key} className={cn('relative flex items-center gap-2 pr-4 transition-colors duration-150 hover:bg-surface-hover/50 sm:pr-5', hot && 'bg-vivid-red/[0.04]')}>
              <span className={cn('absolute inset-y-2.5 left-0 w-1 rounded-r-full', meta.bar)} aria-hidden="true" />
              <Link
                viewTransition
                to={item.href}
                className="group flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 outline-none transition-colors duration-150 active:bg-surface-hover focus-visible:bg-surface-hover sm:pl-5"
              >
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-white', CATEGORY_TILE[item.category])}>
                  <Icon className="size-5" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="line-clamp-2 leading-snug t-card font-display font-semibold text-text">{item.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={meta.tone} icon={meta.icon}>{meta.short}</Pill>
                    {due && <Pill tone={DUE_TONE[due.level]} icon={due.level === 'late' ? AlarmClockOff : due.level === 'soon' ? Hourglass : undefined} dot={due.level === 'today'}>{due.label}</Pill>}
                    <Pill tone="neutral" className="max-sm:hidden">{ACTIVITY_CATEGORY_LABEL[item.category]}</Pill>
                  </span>
                  {item.detail && <span className="line-clamp-2 t-meta text-text-muted max-sm:hidden">{item.detail}</span>}
                </span>
              </Link>
              {actionFor(item)}
            </li>
          );
        })}
      </ul>
      {taskMove.statusRemarkDialog}
      {ticketMove.statusRemarkDialog}
      {(hidden > 0 || expanded || nextUpHidden) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 px-4 py-2 sm:px-5">
          <p className="flex min-w-0 flex-1 items-center gap-2 t-meta font-medium text-text-secondary">
            {nextUpHidden && (
              <>
                <Hourglass className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                <span className="line-clamp-1">Next up: {nextUpHidden.title}, {dueInfo(nextUpHidden.at, now).label.toLowerCase()}</span>
              </>
            )}
          </p>
          {(hidden > 0 || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full border border-border px-3.5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985] pointer-fine:min-h-9"
            >
              {expanded ? 'Show less' : `Show ${hidden} more`}
              <ChevronDown className={cn('size-3.5 transition-transform duration-150', expanded && 'rotate-180')} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {approvalsLine}
    </section>
  );
};
