import { AlertTriangle, Clock } from 'lucide-react';
import { StatusChip, type StatusChipStatus } from '../../components';
import { useNow } from '../../lib/useNow';
import { STATUS_LABEL } from './taskDisplay';
import { waitingLine } from './taskStatusModel';
import type { Task } from '../../api/task';

const CHIP_KEY: Record<Task['status'], StatusChipStatus> = {
  draft: 'open',
  todo: 'open',
  in_progress: 'in_progress',
  pending_approval: 'pending_approval',
  done: 'completed',
  on_hold: 'on_hold',
};

interface TaskStatusCardProps {
  task: Task;
  nameOf: (id: string | null | undefined) => string | undefined;
}

/**
 * Where a delegation stands: the status chip, who it is waiting on, and when it is due. No
 * progress bar of its own; the score panel right below already carries one.
 */
export const TaskStatusCard = ({ task, nameOf }: TaskStatusCardProps) => {
  const now = useNow();
  const { who, due } = waitingLine(task, now, nameOf);

  return (
    <section aria-label="Status" className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-surface-hover/30 p-3 sm:p-4">
      <StatusChip status={CHIP_KEY[task.status]} label={STATUS_LABEL[task.status]} className="self-start" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-display">
        <span className="inline-flex items-center gap-1.5 text-text-secondary min-w-0">
          <Clock size={14} className="shrink-0 text-text-light" aria-hidden />
          <span className="break-words">{who}</span>
        </span>
        {due && (
          <span className={`inline-flex items-center gap-1.5 font-semibold ${due.overdue ? 'text-danger' : 'text-text-muted'}`}>
            {due.overdue && <AlertTriangle size={14} className="shrink-0" aria-hidden />}
            {due.text}
          </span>
        )}
      </div>
    </section>
  );
};
