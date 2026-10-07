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

const STAGES: Task['status'][] = ['todo', 'in_progress', 'pending_approval', 'done'];

interface TaskStatusCardProps {
  task: Task;
  nameOf: (id: string | null | undefined) => string | undefined;
}

/**
 * The one place a delegation says where it stands: status chip, a four-part progress bar, and a
 * line on who it is waiting on and when it is due. The Progress list further down only holds the
 * history, with each remark.
 */
export const TaskStatusCard = ({ task, nameOf }: TaskStatusCardProps) => {
  const now = useNow();
  const held = task.status === 'on_hold';
  // A held delegation keeps the place it was paused at, so the bar still shows how far it got.
  const pausedAt = held ? (task.statusUpdates ?? []).find((u) => u.toStatus === 'on_hold')?.fromStatus ?? 'in_progress' : task.status;
  const index = STAGES.indexOf(pausedAt);
  const { who, due } = waitingLine(task, now, nameOf);

  return (
    <section aria-label="Status" className="flex flex-col gap-3 rounded-xl border border-border/60 bg-surface-hover/30 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <StatusChip status={CHIP_KEY[task.status]} label={STATUS_LABEL[task.status]} />
        {index >= 0 && (
          <span className="text-xs font-semibold text-text-light tabular-nums shrink-0">
            {held ? 'Paused at step' : 'Step'} {index + 1} of {STAGES.length}
          </span>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={STAGES.length}
        aria-valuenow={index + 1}
        aria-label="Delegation progress"
        className="grid grid-cols-4 gap-1.5"
      >
        {STAGES.map((s, i) => (
          <div key={s} className="flex flex-col gap-1 min-w-0">
            <span className={`h-1.5 rounded-full transition-colors duration-300 ${i < index || (i === index && s === 'done') ? 'bg-success' : i === index ? (held ? 'bg-warning' : 'bg-primary-600 dark:bg-primary-400') : 'bg-primary-500/20'}`} />
            <span className={`text-xs font-display truncate ${i === index ? 'font-semibold text-text' : 'text-text-light'}`}>{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>

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
