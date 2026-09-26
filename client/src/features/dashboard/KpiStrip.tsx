import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardList, TicketCheck, ListChecks, ListTodo, type LucideIcon } from 'lucide-react';
import { StatusBreakdownCard, type StatusBreakdownVariant } from './StatusBreakdownCard';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import { AdminChromeAccents } from '../admin/AdminChromeAccents';
import { Skeleton } from '../../components/skeleton';
import { useChecklistInstanceSummaryQuery, useMyChecklistInstancesQuery } from '../checklist/hook';
import { isInstanceOverdue } from '../checklist/checklistDisplay';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import type { Todo } from '../../api/todos';

export interface WorkflowStats {
  pending: number;
  approvals: number;
  completed: number;
  assigned: number;
}

interface KpiStripProps {
  tickets: Ticket[];
  /** Same task list `workflowStats` was computed from — org-wide for ADMIN/PC, "mine" otherwise —
   *  so a stat's preview modal always lists exactly the records that produced its count. */
  tasks: Task[];
  /** Always "mine" — todos have no org-wide dashboard query yet, so this card stays personally
   *  scoped even for an admin (same caveat ActivityComplianceGauges' scope filters already carry
   *  for todos). */
  todos: Todo[];
  isPending: boolean;
  workflowStats: WorkflowStats;
}

interface Drilldown {
  title: string;
  icon: LucideIcon;
  rows: DrilldownRow[];
  viewAllHref: string;
  viewAllLabel: string;
  cappedNote?: string;
}

const taskRow = (t: Task): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tasks?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'done',
  overdue: t.status !== 'done' && !!t.dueDate && new Date(t.dueDate).getTime() < Date.now(),
});

const ticketRow = (t: Ticket): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tickets?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'CLOSED',
  overdue: t.isOverdue,
});

const todoRow = (t: Todo): DrilldownRow => ({
  id: t.id,
  title: t.text,
  // Todos have no standalone detail view or `?open=` deep link — same as dashboardDisplay.ts's
  // ActivityWorkItem mapping for todos — so this points at the list page, not one specific item.
  link: '/todo',
  createdAt: t.createdAt,
  completed: t.completed,
  overdue: !t.completed && !!t.dueDate && new Date(t.dueDate).getTime() < Date.now(),
});

/**
 * Mirrors StatusBreakdownCard's real structure — same shell, same header divider, same right-hand
 * total box — so what loads in looks like what was loading. It takes the same `variant` as the
 * real card for exactly that reason: with a navy hero followed by two surface cards, a skeleton
 * row of three identical placeholders would visibly re-colour as the data arrived.
 *
 * On the navy shell the shared Skeleton's `bg-surface-active` default is overridden to
 * `bg-white/10` so the placeholders read against the dark ground.
 */
const KpiCardSkeleton = ({ variant }: { variant: StatusBreakdownVariant }) => {
  const isNavy = variant === 'navy';
  const block = isNavy ? 'bg-white/10' : '';

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border ${
        isNavy
          ? 'border-transparent bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700'
          : 'border-border/60 dark:border-white/[0.06] bg-surface'
      }`}
    >
      {/* Clipped to the header strip itself, same fix as the real StatusBreakdownCard — otherwise
          the ring's bottom arc reaches past the header and crosses the Total placeholder below. */}
      <div className={`relative z-10 flex items-center gap-2 px-4 py-3.5 border-b overflow-hidden ${isNavy ? 'border-white/10' : 'border-border/60'}`}>
        {isNavy && <AdminChromeAccents scale="compact" />}
        <Skeleton className={`size-4 rounded shrink-0 ${block}`} />
        <Skeleton className={`h-4 w-28 rounded-md ${block}`} />
      </div>

      <div className="relative z-10 flex items-stretch gap-3 p-3">
        <div className="flex-1 flex flex-col justify-center gap-3 px-1">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <Skeleton className={`h-3.5 w-20 rounded ${block}`} />
              <Skeleton className={`h-3.5 w-6 rounded ${block}`} />
            </div>
          ))}
        </div>
        <div
          className={`flex flex-col items-center justify-center gap-1.5 w-24 sm:w-28 shrink-0 rounded-xl border ${
            isNavy ? 'border-white/15 bg-white/5' : 'border-border/60 bg-surface-hover/50'
          }`}
        >
          <Skeleton className={`h-7 w-12 rounded-md ${block}`} />
          <Skeleton className={`h-3 w-10 rounded ${block}`} />
        </div>
      </div>
    </div>
  );
};

// All four KPI cards share the navy hero treatment, at the user's explicit request — Delegation,
// Tickets, Checklist and Todo read as one uniform row instead of one dark card standing out
// against three quiet ones.
const CARD_VARIANTS: readonly StatusBreakdownVariant[] = ['navy', 'navy', 'navy', 'navy'];

export const KpiStrip = ({ tickets, tasks, todos, isPending, workflowStats }: KpiStripProps) => {
  const navigate = useNavigate();
  const { data: checklistSummary } = useChecklistInstanceSummaryQuery({ mine: true });
  // Same capped "recent" window RecentActivity uses on this page — enough for a preview modal's
  // rows, not a second unbounded checklist list living inside a popup.
  const { data: checklistInstances = [] } = useMyChecklistInstancesQuery({}, { limit: 25 });
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid sm:hidden grid-cols-2 gap-2.5">
          {CARD_VARIANTS.map((_, i) => (
            <Skeleton key={i} className="h-[84px] rounded-2xl" />
          ))}
        </div>
        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-5">
          {CARD_VARIANTS.map((variant, i) => (
            <KpiCardSkeleton key={i} variant={variant} />
          ))}
        </div>
      </div>
    );
  }

  // --- Derived Metrics ---

  // "New today" — same local calendar day as right now, not a rolling 24h window, so the count
  // resets at midnight the way a person reading "today" would expect rather than slowly draining
  // as the day goes on.
  const today = new Date();
  const isToday = (dateString: string) => {
    const d = new Date(dateString);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  };

  // Tickets: OPEN/IN_PROGRESS/PENDING_APPROVAL/ON_HOLD map to 'Due'. CLOSED maps to 'Completed'.
  const dueTickets = tickets.filter(t => t.status !== 'CLOSED');
  const completedTickets = tickets.filter(t => t.status === 'CLOSED');
  const newTicketsToday = tickets.filter(t => isToday(t.createdAt));

  const dueTasks = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress' || t.status === 'pending_approval');
  const completedTasks = tasks.filter(t => t.status === 'done');
  const newTasksToday = tasks.filter(t => isToday(t.createdAt));

  const dueTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);
  const newTodosToday = todos.filter(t => isToday(t.createdAt));

  const dueChecklists = checklistInstances.filter(c => c.items.length === 0 || c.items.some(i => !i.isDone));
  const completedChecklists = checklistInstances.filter(c => c.items.length > 0 && c.items.every(i => i.isDone));
  const newChecklistsToday = checklistInstances.filter(c => isToday(c.generatedAt));
  const checklistRow = (c: (typeof checklistInstances)[number]): DrilldownRow => {
    const total = c.items.length;
    const done = c.items.filter(i => i.isDone).length;
    const completed = total > 0 && done === total;
    return {
      id: c.id,
      title: c.title,
      link: `/checklists/${c.id}`,
      createdAt: c.generatedAt,
      completed,
      // Was `new Date(c.cutoffTime).getTime() < Date.now()` — cutoffTime is a bare "HH:mm" string,
      // not a full timestamp, so that parsed to Invalid Date/NaN and could never actually fire.
      overdue: isInstanceOverdue(c, completed),
    };
  };

  // Mobile summary: the two numbers that matter at a glance (how many, how many still due) for all
  // four modules at once, in a 2x2 grid that fits a phone without scrolling. Replaces a horizontal
  // chip strip that always sliced its last chip off at the screen edge, plus a "Show breakdown"
  // toggle hiding the full cards — the Completed/New today breakdown lives on each module's own page.
  const mobileTiles: { key: string; icon: LucideIcon; title: string; total: number; due: number; href: string }[] = [
    { key: 'delegation', icon: ClipboardList, title: 'Delegation', total: workflowStats.assigned, due: workflowStats.pending + workflowStats.approvals, href: '/tasks' },
    { key: 'tickets', icon: TicketCheck, title: 'Tickets', total: tickets.length, due: dueTickets.length, href: '/tickets' },
    { key: 'checklist', icon: ListChecks, title: 'Checklist', total: checklistSummary?.total ?? 0, due: checklistSummary?.pending ?? 0, href: '/checklists' },
    { key: 'todo', icon: ListTodo, title: 'Todo', total: todos.length, due: dueTodos.length, href: '/todo' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid sm:hidden grid-cols-2 gap-2.5">
        {mobileTiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => navigate(tile.href)}
            aria-label={`${tile.title}: ${tile.total} total, ${tile.due} due`}
            className="flex flex-col gap-2 p-3 rounded-2xl bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white text-left cursor-pointer transition-transform duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="flex items-center justify-center size-6 rounded-lg bg-white/15 shrink-0">
                <tile.icon size={13} strokeWidth={2.5} />
              </span>
              <span className="text-xs font-display font-semibold text-white/85 truncate">{tile.title}</span>
            </span>
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-display font-bold tabular-nums leading-none">{tile.total}</span>
              <span className="text-[11px] font-display font-medium text-white/70 tabular-nums whitespace-nowrap">{tile.due} due</span>
            </span>
          </button>
        ))}
      </div>

      <div className="hidden sm:contents">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-5">

      {/* Delegation Card */}
      <StatusBreakdownCard
        variant={CARD_VARIANTS[0]}
        icon={ClipboardList}
        title="Delegation"
        total={workflowStats.assigned}
        onOpen={() => navigate('/tasks')}
        rows={[
          {
            label: 'Due',
            value: workflowStats.pending + workflowStats.approvals,
            onClick: () => setDrilldown({
              title: 'Due delegations',
              icon: ClipboardList,
              rows: dueTasks.map(taskRow),
              viewAllHref: '/tasks?quickFilter=pending',
              viewAllLabel: 'View all in Delegations',
            }),
          },
          {
            label: 'Completed',
            value: workflowStats.completed,
            onClick: () => setDrilldown({
              title: 'Completed delegations',
              icon: ClipboardList,
              rows: completedTasks.map(taskRow),
              viewAllHref: '/tasks?status=done',
              viewAllLabel: 'View all in Delegations',
            }),
          },
          {
            label: 'New today',
            value: newTasksToday.length,
            onClick: () => setDrilldown({
              title: 'New delegations today',
              icon: ClipboardList,
              rows: newTasksToday.map(taskRow),
              viewAllHref: '/tasks',
              viewAllLabel: 'View all in Delegations',
            }),
          },
        ]}
      />

      {/* Tickets Card */}
      <StatusBreakdownCard
        variant={CARD_VARIANTS[1]}
        icon={TicketCheck}
        title="Tickets"
        total={tickets.length}
        onOpen={() => navigate('/tickets')}
        rows={[
          {
            label: 'Due',
            value: dueTickets.length,
            onClick: () => setDrilldown({
              title: 'Due tickets',
              icon: TicketCheck,
              rows: dueTickets.map(ticketRow),
              viewAllHref: '/tickets?quickFilter=pending',
              viewAllLabel: 'View all in Tickets',
            }),
          },
          {
            label: 'Completed',
            value: completedTickets.length,
            onClick: () => setDrilldown({
              title: 'Completed tickets',
              icon: TicketCheck,
              rows: completedTickets.map(ticketRow),
              viewAllHref: '/tickets?quickFilter=completed',
              viewAllLabel: 'View all in Tickets',
            }),
          },
          {
            label: 'New today',
            value: newTicketsToday.length,
            onClick: () => setDrilldown({
              title: 'New tickets today',
              icon: TicketCheck,
              rows: newTicketsToday.map(ticketRow),
              viewAllHref: '/tickets',
              viewAllLabel: 'View all in Tickets',
            }),
          },
        ]}
      />

      {/* Checklist Card */}
      <StatusBreakdownCard
        variant={CARD_VARIANTS[2]}
        icon={ListChecks}
        title="Checklist"
        total={checklistSummary?.total ?? 0}
        onOpen={() => navigate('/checklists')}
        rows={[
          {
            label: 'Due',
            value: checklistSummary?.pending ?? 0,
            onClick: () => setDrilldown({
              title: 'Due checklists',
              icon: ListChecks,
              rows: dueChecklists.map(checklistRow),
              viewAllHref: '/checklists?status=due',
              viewAllLabel: 'View all in Checklist',
              cappedNote: (checklistSummary?.pending ?? 0) > dueChecklists.length
                ? `Showing your ${dueChecklists.length} most recent — ${checklistSummary!.pending} total are due.`
                : undefined,
            }),
          },
          {
            label: 'Completed',
            value: checklistSummary?.completed ?? 0,
            onClick: () => setDrilldown({
              title: 'Completed checklists',
              icon: ListChecks,
              rows: completedChecklists.map(checklistRow),
              viewAllHref: '/checklists?status=completed',
              viewAllLabel: 'View all in Checklist',
              cappedNote: (checklistSummary?.completed ?? 0) > completedChecklists.length
                ? `Showing your ${completedChecklists.length} most recent — ${checklistSummary!.completed} total are completed.`
                : undefined,
            }),
          },
          {
            label: 'New today',
            value: newChecklistsToday.length,
            onClick: () => setDrilldown({
              title: 'New checklists today',
              icon: ListChecks,
              rows: newChecklistsToday.map(checklistRow),
              viewAllHref: '/checklists',
              viewAllLabel: 'View all in Checklist',
            }),
          },
        ]}
      />

      {/* Todo Card — always personally-scoped (see the `todos` prop doc), so an admin sees only
          their own todos here even though Delegation/Tickets go org-wide for them. */}
      <StatusBreakdownCard
        variant={CARD_VARIANTS[3]}
        icon={ListTodo}
        title="Todo"
        total={todos.length}
        onOpen={() => navigate('/todo')}
        rows={[
          {
            label: 'Due',
            value: dueTodos.length,
            onClick: () => setDrilldown({
              title: 'Due todos',
              icon: ListTodo,
              rows: dueTodos.map(todoRow),
              viewAllHref: '/todo?quickFilter=pending',
              viewAllLabel: 'View all in Todo',
            }),
          },
          {
            label: 'Completed',
            value: completedTodos.length,
            onClick: () => setDrilldown({
              title: 'Completed todos',
              icon: ListTodo,
              rows: completedTodos.map(todoRow),
              viewAllHref: '/todo?quickFilter=completed',
              viewAllLabel: 'View all in Todo',
            }),
          },
          {
            label: 'New today',
            value: newTodosToday.length,
            onClick: () => setDrilldown({
              title: 'New todos today',
              icon: ListTodo,
              rows: newTodosToday.map(todoRow),
              viewAllHref: '/todo',
              viewAllLabel: 'View all in Todo',
            }),
          },
        ]}
      />
    </div>
      </div>

      {drilldown && (
        <DrilldownModal
          open
          onClose={() => setDrilldown(null)}
          title={drilldown.title}
          icon={drilldown.icon}
          rows={drilldown.rows}
          viewAllHref={drilldown.viewAllHref}
          viewAllLabel={drilldown.viewAllLabel}
          cappedNote={drilldown.cappedNote}
        />
      )}
    </div>
  );
};