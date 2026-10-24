import { AlertTriangle, Clock } from 'lucide-react';
import { TaskStatusChip } from './TaskStatusChip';
import { useNow } from '../../lib/useNow';
import { waitingLine } from './taskStatusModel';
import type { Task } from '../../api/task';

interface TaskStatusCardProps {
  task: Task;
  nameOf: (id: string | null | undefined) => string | undefined;
  departmentName?: string;
  hideChip?: boolean;
}

export const TaskStatusCard = ({ task, nameOf, departmentName, hideChip = false }: TaskStatusCardProps) => {
  const now = useNow();
  const { who, due } = waitingLine(task, now, nameOf, departmentName);

  return (
    <section aria-label="Status" className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-surface-hover/30 p-2.5 sm:p-3">
      {!hideChip && (
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusChip status={task.status} declined={!!task.declinedAt} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-meta font-display">
        <span className="inline-flex items-center gap-1.5 text-text-secondary min-w-0">
          <Clock size={13} className="shrink-0 text-text-light" aria-hidden />
          <span className="break-words">{who}</span>
        </span>
        {due && (
          <span className={`inline-flex items-center gap-1.5 font-semibold ${due.overdue ? 'text-danger' : 'text-text-muted'}`}>
            {due.overdue && <AlertTriangle size={13} className="shrink-0" aria-hidden />}
            {due.text}
          </span>
        )}
      </div>
    </section>
  );
};
