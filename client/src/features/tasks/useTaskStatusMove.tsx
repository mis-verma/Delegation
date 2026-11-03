import { useCallback, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { TaskStatusRemarkDialog } from './TaskStatusRemarkDialog';
import { useUpdateTaskMutation } from './hook';
import { STATUS_LABEL } from './taskDisplay';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { FRONT_LINE_BACK_MESSAGE, isBackwardMove } from './taskStatusModel';
import type { Task } from '../../api/task';

export const useTaskStatusMove = () => {
  const updateMutation = useUpdateTaskMutation({ silent: true });
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const frontLine = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const [pendingMove, setPendingMove] = useState<{ task: Task; toStatus: Task['status'] } | null>(null);

  const requestMove = useCallback((task: Task, toStatus: Task['status']) => {
    if (task.status === toStatus) return;

    if (frontLine && isBackwardMove(task.status, toStatus)) {
      toast.error(FRONT_LINE_BACK_MESSAGE);
      return;
    }

    if (task.status === 'done' && !isAdmin) {
      toast.error('This delegation is approved and closed. Only an admin can reopen it.');
      return;
    }

    if (toStatus === 'done') {
      toast.error('A delegation is marked done when a reviewer approves it.');
      return;
    }

    if (toStatus === 'pending_approval' && task.status !== 'in_progress') {
      toast.error(`Move this delegation to ${STATUS_LABEL.in_progress} before marking it completed.`);
      return;
    }

    if (toStatus === 'on_hold' && task.status !== 'todo' && task.status !== 'in_progress') {
      toast.error(`Only a delegation that is ${STATUS_LABEL.todo} or ${STATUS_LABEL.in_progress} can be put on hold.`);
      return;
    }
    if (task.status === 'on_hold' && toStatus !== 'in_progress') {
      toast.error(`Resume this delegation to ${STATUS_LABEL.in_progress} first.`);
      return;
    }

    setPendingMove({ task, toStatus });
  }, [isAdmin, frontLine]);

  const statusRemarkDialog: ReactNode = pendingMove && (
    <TaskStatusRemarkDialog
      task={pendingMove.task}
      toStatus={pendingMove.toStatus}
      isSubmitting={updateMutation.isPending}
      onCancel={() => setPendingMove(null)}
      onConfirm={(statusRemark) => {
        const toStatus = pendingMove.toStatus;
        updateMutation.mutate(
          { id: pendingMove.task.id, payload: { status: toStatus, statusRemark: statusRemark || undefined } },
          {
            onSuccess: () => {
              setPendingMove(null);
              toast.success(toStatus === 'pending_approval' ? 'Marked completed, waiting for approval' : `Moved to ${STATUS_LABEL[toStatus]}`);
            },
          },
        );
      }}
    />
  );

  return { requestMove, statusRemarkDialog };
};
