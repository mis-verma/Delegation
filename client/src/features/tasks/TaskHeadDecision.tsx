import { useState } from 'react';
import { Ban, RotateCcw } from 'lucide-react';
import { Button } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { DeclineTicketDialog } from '../tickets/detail/DeclineTicketDialog';
import { HeadApprovedBanner } from '../tickets/detail/HeadApprovedBanner';
import { HeadDecisionPanel } from '../tickets/detail/HeadDecisionPanel';
import { useApproveTaskAssignmentMutation, useDeclineTaskMutation, useReopenDeclinedTaskMutation } from './hook';
import { canDecideOnTask, taskFlowState } from './taskFlow';
import type { Task } from '../../api/task';

interface TaskHeadDecisionProps {
  task: Task;
  departmentName?: string;
  nameOf: (id: string | null | undefined) => string | undefined;
}

const LIVE_STATUSES: readonly Task['status'][] = ['todo', 'in_progress', 'on_hold'];

export const TaskHeadDecision = ({ task, departmentName, nameOf }: TaskHeadDecisionProps) => {
  const { user } = useAuth();
  const approveMut = useApproveTaskAssignmentMutation();
  const declineMut = useDeclineTaskMutation();
  const reopenMut = useReopenDeclinedTaskMutation();
  const [declining, setDeclining] = useState(false);

  const { awaiting, declined, headApproved } = taskFlowState(task, user);
  const canDecide = canDecideOnTask(task, user);
  const isLeadership = user?.role === 'ADMIN' || user?.role === 'PC';
  const canDeclineLive = canDecide && headApproved && LIVE_STATUSES.includes(task.status) && (isLeadership || task.userId !== user?.id);

  const raiser = nameOf(task.userId);
  const assignee = nameOf(task.assigneeId);

  return (
    <>
      {declined && (
        <div className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between" role="status">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-danger to-danger/70 text-white" aria-hidden="true">
              <Ban size={16} strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <p className="t-card font-display font-bold text-danger">Declined{task.decliner ? ` by ${task.decliner.firstName}` : ''}</p>
              {task.declineReason && <p className="mt-0.5 text-[0.9375rem] font-medium leading-relaxed text-text-secondary break-words">{task.declineReason}</p>}
            </div>
          </div>
          {canDecide && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reopenMut.mutate({ id: task.id })}
              isLoading={reopenMut.isPending}
              className="shrink-0 gap-1.5 font-display font-semibold"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reopen
            </Button>
          )}
        </div>
      )}

      {awaiting && (
        <HeadDecisionPanel
          noun="delegation"
          itemTitle={task.title}
          raiser={raiser ? { firstName: raiser } : null}
          assignee={assignee ? { firstName: assignee } : null}
          departmentName={departmentName}
          canDecide={canDecide}
          isApproving={approveMut.isPending}
          isDeclining={declineMut.isPending}
          onApprove={() => approveMut.mutate({ id: task.id })}
          onDecline={() => setDeclining(true)}
        />
      )}

      {headApproved && task.assignmentApprovedAt && (
        <div className="flex flex-col gap-2">
          <HeadApprovedBanner approver={task.assignmentApprover} approvedAt={task.assignmentApprovedAt} departmentName={departmentName} />
          {canDeclineLive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeclining(true)}
              className="self-start gap-1.5 font-display font-semibold text-danger hover:bg-danger/10 hover:text-danger"
            >
              <Ban size={14} aria-hidden="true" />
              Decline this delegation
            </Button>
          )}
        </div>
      )}

      <DeclineTicketDialog
        noun="delegation"
        open={declining}
        ticketTitle={task.title}
        isPending={declineMut.isPending}
        onCancel={() => setDeclining(false)}
        onConfirm={(reason) => declineMut.mutate({ id: task.id, reason }, { onSuccess: () => setDeclining(false) })}
      />
    </>
  );
};
