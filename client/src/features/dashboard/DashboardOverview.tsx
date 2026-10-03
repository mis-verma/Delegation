import { KpiStrip } from './KpiStrip';
import type { DashboardSummaries } from './useDashboardSummaries';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import type { Todo } from '../../api/todos';
import type { ChecklistInstance } from '../../api/checklistInstances';

interface DashboardOverviewProps {
  summaries: DashboardSummaries['kpi'];
  taskList: Task[];
  ticketList: Ticket[];
  todoList: Todo[];
  checklistList: ChecklistInstance[];
}

export const DashboardOverview = ({ summaries, taskList, ticketList, todoList, checklistList }: DashboardOverviewProps) => (
  <section aria-label="Dashboard overview" className="w-full relative z-10">
    <KpiStrip summaries={summaries} taskList={taskList} ticketList={ticketList} todoList={todoList} checklistList={checklistList} />
  </section>
);
