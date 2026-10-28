import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Segmented } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { TeamWorkPanel } from './TeamWorkPanel';
import { useFocusView, type FocusView } from './useFocusView';
import { Link } from 'react-router';
import { AlarmClockOff, BellRing, CheckCheck, ChevronDown, Clock3, RotateCw, Send, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../components/entityCard';
import { DueChip } from '../../components/dueChip';
import { IconChip } from '../../components/iconChip';
import { RadialGauge } from '../../components';
import { TONE_COLOR, toneOf } from './scoreTone';
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
const SHOW = 6;

const REASON_LABEL: Record<Reason, string> = { sentBack: 'Sent back to you', overdue: 'Late', submit: 'Ready to submit', dueToday: 'Due today' };
const REASON_TEXT: Record<Reason, string> = { sentBack: 'text-vivid-red-text', overdue: 'text-vivid-red-text', submit: 'text-vivid-sky-text', dueToday: 'text-vivid-blue-text' };

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

const TILE_CLASS = 'flex size-11 shrink-0 items-center justify-center rounded-xl text-white';
const TILE_DANGER = 'bg-linear-to-br from-vivid-red to-vivid-red/70';
const TILE_SUCCESS = 'bg-linear-to-br from-vivid-green to-vivid-green/70';
const TILE_PRIMARY = 'bg-linear-to-br from-vivid-blue to-vivid-blue/70';

interface FocusNowCardProps {
  ownWorkOnly?: boolean;
  reviewCount?: number;
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

const FocusWorkCard = ({ ownWorkOnly = false, reviewCount = 0, todayChecklist = null, tasks, tickets, checklists, todos, now, isPending = false, isError = false, onRetry, updatedAt, onRefresh, isRefreshing }: FocusNowCardProps) => {
  const taskMove = useTaskStatusMove();
  const ticketMove = useTicketStatusMove();
  const todoUpdate = useUpdateTodoMutation();
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();
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
  const nextUp = items.filter((i) => i.reason === 'dueToday' && i.at > now).sort((a, b) => a.at - b.at)[0];
  const ring = (fallback: ReactNode) =>
    percent === null ? fallback : (
      <RadialGauge
        percent={percent}
        size={isMobile ? 52 : 64}
        variant="circle"
        ariaLabel={`Today: ${percent} percent done`}
        gradientFrom={TONE_COLOR[toneOf(percent)]}
        gradientTo={TONE_COLOR[toneOf(percent)]}
      >
        <span className="t-meta font-display font-extrabold tabular-nums text-text">{percent}%</span>
      </RadialGauge>
    );
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
  const shown = expanded ? items : items.slice(0, SHOW);
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
    const teamNeedsLook = ownWorkOnly && reviewCount > 0;
    return (
      <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex items-center gap-3 px-4 py-3.5 border-success/30 bg-success/5')}>
        {ring(
          <span className={cn(TILE_CLASS, TILE_SUCCESS)}>
            <CheckCheck className="size-5" strokeWidth={2.5} aria-hidden="true" />
          </span>,
        )}
        <div className="min-w-0 flex-1">
          <h2 id="focus-now-heading" className="t-section font-display font-bold tracking-tight text-text">
            {ownWorkOnly ? 'Your own work is on track' : "You're on track"}
          </h2>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="t-meta font-medium text-text-secondary">
              {teamNeedsLook
                ? `Nothing of yours is overdue or due today. ${reviewCount} ${reviewCount === 1 ? 'item from your team needs' : 'items from your team need'} a look below.`
                : 'Nothing is overdue or due today.'}
            </p>
            {updated}
          </div>
        </div>
        {refresh}
      </section>
    );
  }

  return (
    <section aria-labelledby="focus-now-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden', urgent > 0 ? 'border-danger/30' : 'border-primary-500/30')}>
      <div className="flex items-start gap-3 px-3 py-3 sm:items-center sm:px-4">
        {ring(
          <span className={cn(TILE_CLASS, urgent > 0 ? TILE_DANGER : TILE_PRIMARY)}>
            <BellRing className="size-5 motion-safe:animate-[bell-ring_1.2s_ease-in-out_1]" aria-hidden="true" />
          </span>,
        )}
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
          {ownWorkOnly && (
            <p className="hidden t-meta text-text-muted sm:block">
              Only your own work.{reviewCount > 0 ? ` ${reviewCount} more ${reviewCount === 1 ? 'item needs' : 'items need'} your review in the cards below.` : ' Your team is in the cards below.'}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lateCount > 0 && <IconChip icon={AlarmClockOff} tone="bg-vivid-red" label={`${lateCount} late`} labelClassName="tabular-nums text-vivid-red-text" className="border-vivid-red/40 bg-vivid-red/10" />}
            {sentBackCount > 0 && <IconChip icon={Undo2} tone="bg-vivid-red" label={`${sentBackCount} sent back`} labelClassName="tabular-nums text-vivid-red-text" className="border-vivid-red/40 bg-vivid-red/10" />}
            {submitCount > 0 && <IconChip icon={Send} tone="bg-vivid-sky" label={`${submitCount} to submit`} labelClassName="tabular-nums text-vivid-sky-text" className="border-vivid-sky/40 bg-vivid-sky/10" />}
            {todayCount > 0 && <IconChip icon={Clock3} tone="bg-vivid-blue" label={`${todayCount} due today`} labelClassName="tabular-nums text-vivid-blue-text" className="border-vivid-blue/40 bg-vivid-blue/10" />}
          </div>
        </div>
        {refresh}
      </div>
      {nextUp && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 bg-surface-hover/40 px-3 py-2 sm:px-4 t-meta font-medium text-text-secondary">
          <span className="font-display font-semibold text-text">Next up</span>
          <span className="line-clamp-1 min-w-0 flex-1">{nextUp.title}</span>
          <DueChip at={nextUp.at} now={now} />
        </div>
      )}
      {error}

      <ul className="flex flex-col divide-y divide-border/60 border-t border-border/60">
        {shown.map((item, index) => {
          const Icon = CATEGORY_ICON[item.category];
          const hot = item.reason === 'sentBack' || item.reason === 'overdue';
          const startsGroup = index === 0 || shown[index - 1]!.reason !== item.reason;
          return (
            <Fragment key={item.key}>
            {startsGroup && (
              <li className="flex items-center gap-2 bg-surface-hover/40 px-3 py-1.5 sm:px-4">
                <h3 className={cn('t-meta font-display font-bold', REASON_TEXT[item.reason])}>{REASON_LABEL[item.reason]}</h3>
                <span className="t-meta font-semibold tabular-nums text-text-muted">{count(item.reason)}</span>
              </li>
            )}
            <li className={cn('flex items-center gap-2 pr-3 transition-colors hover:bg-surface-hover/50', hot && 'bg-danger/5')}>
              <Link
                viewTransition
                to={item.href}
                className="group flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 pl-3 outline-none sm:gap-3 sm:pl-4 transition-colors active:bg-surface-hover focus-visible:bg-surface-hover"
              >
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl text-white sm:size-10', CATEGORY_TILE[item.category])}>
                  <Icon className="size-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="line-clamp-2 leading-snug t-card font-display font-semibold text-text">{item.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 t-meta font-display font-semibold', CATEGORY_PILL[item.category])}>{ACTIVITY_CATEGORY_LABEL[item.category]}</span>
                    {item.at > 0 && <DueChip at={item.at} now={now} />}
                  </span>
                  {item.detail && <span className="line-clamp-2 t-meta text-text-muted">{item.detail}</span>}
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
      {items.length > SHOW && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 t-meta font-display font-semibold text-vivid-blue-text outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover cursor-pointer"
        >
          {expanded ? 'Show less' : `Show ${items.length - SHOW} more`}
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
        </button>
      )}
    </section>
  );
};


const VIEW_OPTIONS = [
  { value: 'work', label: 'My work' },
  { value: 'team', label: 'My team' },
] as const;

export const FocusNowCard = (props: FocusNowCardProps) => {
  const { user } = useAuth();
  const [view, setView] = useFocusView(user?.id);
  if (!props.ownWorkOnly) return <FocusWorkCard {...props} />;
  return (
    <div className="flex flex-col gap-2">
      <Segmented<FocusView> label="Show my work or my team" options={VIEW_OPTIONS} value={view} onChange={setView} className="w-full sm:w-fit [&>button]:flex-1 sm:[&>button]:flex-none" />
      {view === 'team' ? <TeamWorkPanel /> : <FocusWorkCard {...props} />}
    </div>
  );
};
