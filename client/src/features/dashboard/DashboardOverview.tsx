import type { ReactNode } from 'react';
import { KpiStrip, type WorkflowStats } from './KpiStrip';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import type { Todo } from '../../api/todos';

interface DashboardOverviewProps {
  isPending: boolean;
  tickets: Ticket[];
  tasks: Task[];
  todos: Todo[];
  workflowStats: WorkflowStats;
  /** Passed straight through to KpiStrip's "Show breakdown" row — see its own prop doc. */
  toolbar?: ReactNode;
}

export const DashboardOverview = ({
  isPending,
  tickets,
  tasks,
  todos,
  workflowStats,
  toolbar,
}: DashboardOverviewProps) => {
  return (
    <section
      aria-label="Dashboard Overview"
      className="w-full relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both"
    >
      <KpiStrip
        tickets={tickets}
        tasks={tasks}
        todos={todos}
        isPending={isPending}
        workflowStats={workflowStats}
        toolbar={toolbar}
      />
    </section>
  );
};