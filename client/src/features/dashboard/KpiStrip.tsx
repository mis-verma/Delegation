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
      {isNavy && <AdminChromeAccents scale="compact" />}

      <div className={`relative z-10 flex items-center gap-2 px-4 py-3.5 border-b ${isNavy ? 'border-white/10' : 'border-border/60'}`}>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-5">
        {CARD_VARIANTS.map((variant, i) => (
          <KpiCardSkeleton key={i} variant={variant} />
        ))}
      </div>
    );
  }

  // --- Derived Metrics ---

  // Tickets: OPEN/IN_PROGRESS/IN_REVIEW/ON_HOLD map to 'Due'. CLOSED maps to 'Completed'.
  const dueTickets = tickets.filter(t => t.status !== 'CLOSED');
  const completedTickets = tickets.filter(t => t.status === 'CLOSED');

  const dueTasks = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress' || t.status === 'pending_verification');
  const completedTasks = tasks.filter(t => t.status === 'done');

  const dueTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  const dueChecklists = checklistInstances.filter(c => c.items.length === 0 || c.items.some(i => !i.isDone));
  const completedChecklists = checklistInstances.filter(c => c.items.length > 0 && c.items.every(i => i.isDone));
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

  return (
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
            tone: 'warning',
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
            tone: 'success',
            onClick: () => setDrilldown({
              title: 'Completed delegations',
              icon: ClipboardList,
              rows: completedTasks.map(taskRow),
              viewAllHref: '/tasks?status=done',
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
            tone: 'warning',
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
            tone: 'success',
            onClick: () => setDrilldown({
              title: 'Completed tickets',
              icon: TicketCheck,
              rows: completedTickets.map(ticketRow),
              viewAllHref: '/tickets?quickFilter=completed',
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
            tone: 'warning',
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
            tone: 'success',
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
            tone: 'warning',
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
            tone: 'success',
            onClick: () => setDrilldown({
              title: 'Completed todos',
              icon: ListTodo,
              rows: completedTodos.map(todoRow),
              viewAllHref: '/todo?quickFilter=completed',
              viewAllLabel: 'View all in Todo',
            }),
          },
        ]}
      />

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