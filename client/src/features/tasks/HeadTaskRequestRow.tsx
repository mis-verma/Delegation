import { useState } from 'react';
import { ArrowRight, Ban, CalendarDays, CircleCheck, ShieldQuestion } from 'lucide-react';
import { Button, DepartmentChip, IconChip, PriorityChip, WaitChip } from '../../components';
import { cn } from '@/lib/utils';
import { Avatar } from '../tickets/approvals/HeadRequestRow';
import { DeclineTicketDialog } from '../tickets/detail/DeclineTicketDialog';
import { useApproveTaskAssignmentMutation, useDeclineTaskMutation } from './hook';
import { formatShortDate } from './cardFields';
import { PRIORITY_MAP } from './taskDisplay';
import { TaskDetail } from './TaskDetail';
import type { Task } from '../../api/task';

interface HeadTaskRequestRowProps {
  task: Task;
  now: number;
  raiserName?: string;
  assigneeName?: string;
  departmentName?: string;
  embedded?: boolean;
}

export const HeadTaskRequestRow = ({ task, now, raiserName, assigneeName, departmentName, embedded = false }: HeadTaskRequestRowProps) => {
  const [open, setOpen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const approveMut = useApproveTaskAssignmentMutation();
  const declineMut = useDeclineTaskMutation();
  const busy = approveMut.isPending || declineMut.isPending;
  const raiser = raiserName ?? null;
  const assignee = assigneeName ?? null;

  return (
    <div className={cn('flex flex-col gap-3 transition-colors duration-150', embedded ? 'px-4 py-3 sm:px-5' : 'rounded-xl border border-warning/30 bg-warning/5 p-3 hover:border-warning/50 sm:p-4')}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-start gap-3 rounded-lg text-left outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-warning to-warning/70 text-white" aria-hidden="true">
          <ShieldQuestion size={18} strokeWidth={2.3} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="t-card font-display font-semibold leading-snug text-text line-clamp-2 break-words">{task.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 t-meta font-display font-semibold text-text-secondary">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Avatar name={raiser} />
              <span className="truncate">{raiser ?? 'Someone'}</span>
            </span>
            <ArrowRight size={13} className="shrink-0 text-text-light" strokeWidth={2.5} aria-hidden="true" />
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Avatar name={assignee} />
              <span className={`truncate ${assignee ? '' : 'text-text-muted'}`}>{assignee ?? 'Nobody picked yet'}</span>
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <PriorityChip meta={PRIORITY_MAP[task.priority]} />
            {departmentName && <DepartmentChip name={departmentName} />}
            <WaitChip since={task.createdAt} now={now} warnAfterHours={4} dangerAfterHours={24} />
            {task.dueDate && <IconChip icon={CalendarDays} tone="bg-info" label={`Due ${formatShortDate(task.dueDate)}`} className="shrink-0" labelClassName="tabular-nums" />}
          </span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
        <Button
          variant="outline"
          onClick={() => setDeclining(true)}
          disabled={busy}
          className="h-11 gap-1.5 border-danger/40 font-display font-semibold text-danger hover:border-danger hover:bg-danger/10 hover:text-danger sm:h-10"
        >
          <Ban size={16} aria-hidden="true" />
          Decline
        </Button>
        <Button
          variant="primary"
          onClick={() => approveMut.mutate({ id: task.id })}
          isLoading={approveMut.isPending}
          disabled={busy}
          className="h-11 gap-1.5 bg-linear-to-br from-success to-success/80 font-display font-semibold text-white hover:from-success/90 hover:to-success/70 hover:text-white sm:h-10"
        >
          <CircleCheck size={16} aria-hidden="true" />
          Approve
        </Button>
      </div>

      <DeclineTicketDialog
        noun="delegation"
        open={declining}
        ticketTitle={task.title}
        isPending={declineMut.isPending}
        onCancel={() => setDeclining(false)}
        onConfirm={(reason) => declineMut.mutate({ id: task.id, reason }, { onSuccess: () => setDeclining(false) })}
      />

      {open && <TaskDetail task={task} onClose={() => setOpen(false)} />}
    </div>
  );
};
