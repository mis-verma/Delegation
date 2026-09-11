import { useCallback, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { TaskStatusRemarkDialog } from './TaskStatusRemarkDialog';
import { useUpdateTaskMutation } from './hook';
import type { Task } from '../../api/task';

/**
 * The one gate every status change on a card goes through, wherever the card is rendered.
 *
 * A status change can now be started from three places — dragging on the board, the board card's
 * "Move to" menu, and the mobile list's copy of that menu. All three have to apply the same
 * verifier rule and the same mandatory remark, so none of them can be used to get around what the
 * others enforce. Keeping that in one hook is what stops the mobile surface drifting from the
 * board's the way the modules' stat-tile arrays once did.
 *
 * Returns the dialog as a node rather than exposing the pending state, so a caller can't render
 * the move UI and forget to render the gate.
 */
export const useTaskStatusMove = (isVerifier: boolean) => {
  const updateMutation = useUpdateTaskMutation();
  const [pendingMove, setPendingMove] = useState<{ task: Task; toStatus: Task['status'] } | null>(null);

  // useCallback, not a plain function: this is handed to TaskBoard's Column as `onMove`, and
  // Column is React.memo'd specifically so a drag pickup/drop (which sets state elsewhere in the
  // board) doesn't force every card in every column to re-render before the card can visually
  // lift. A fresh function identity every render would silently defeat that memo — the board
  // would look correct but the "laggy pickup" it was fixing would come right back.
  const requestMove = useCallback((task: Task, toStatus: Task['status']) => {
    if (task.status === toStatus) return;

    // Mirrors task.service.ts's update() guard — "done" only happens through the verification
    // flow (TaskVerifyActions' Approve), not a raw status change, so block it client-side with a
    // clear reason instead of letting the request round-trip into a 403.
    if (toStatus === 'done' && !isVerifier) {
      toast.error('Only a verifier can mark a task done — send it for review instead.');
      return;
    }

    // Never commits on its own: the server requires a remark for any status change, and a path
    // that skipped it would both fail and be a way around the rule the detail modal enforces.
    setPendingMove({ task, toStatus });
  }, [isVerifier]);

  const statusRemarkDialog: ReactNode = pendingMove && (
    <TaskStatusRemarkDialog
      task={pendingMove.task}
      toStatus={pendingMove.toStatus}
      isSubmitting={updateMutation.isPending}
      onCancel={() => setPendingMove(null)}
      onConfirm={(statusRemark) => {
        updateMutation.mutate(
          { id: pendingMove.task.id, payload: { status: pendingMove.toStatus, statusRemark } },
          { onSuccess: () => setPendingMove(null) },
        );
      }}
    />
  );

  return { requestMove, statusRemarkDialog };
};
