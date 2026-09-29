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
 * pipeline rules (done only via verify, pending_approval only from in_progress) and the same
 * mandatory remark, so none of them can be used to get around what the others enforce. Keeping
 * that in one hook is what stops the mobile surface drifting from the board's the way the
 * modules' stat-tile arrays once did.
 *
 * Returns the dialog as a node rather than exposing the pending state, so a caller can't render
 * the move UI and forget to render the gate.
 */
export const useTaskStatusMove = () => {
  const updateMutation = useUpdateTaskMutation();
  const [pendingMove, setPendingMove] = useState<{ task: Task; toStatus: Task['status'] } | null>(null);

  // useCallback, not a plain function: this is handed to TaskBoard's Column as `onMove`, and
  // Column is React.memo'd specifically so a drag pickup/drop (which sets state elsewhere in the
  // board) doesn't force every card in every column to re-render before the card can visually
  // lift. A fresh function identity every render would silently defeat that memo — the board
  // would look correct but the "laggy pickup" it was fixing would come right back.
  const requestMove = useCallback((task: Task, toStatus: Task['status']) => {
    if (task.status === toStatus) return;

    // Mirrors task.service.ts's update() guard — "done" only ever happens through the
    // verification flow (TaskVerifyActions' Approve), never a raw status change, for anyone,
    // verifier included — that's the one place that sets verifiedBy/verifiedAt and runs the
    // checklist gate. Block it client-side with a clear reason instead of letting the request
    // round-trip into a 400.
    if (toStatus === 'done') {
      toast.error('Mark a delegation done by approving it from the verify screen — not from here.');
      return;
    }

    // Same mirror for the other half of that guard: pending_approval must arrive from
    // in_progress. A drag or "Move to" pick used to be able to skip straight from To Do (or even
    // Draft) to Pending Approval, "arriving" for review despite never being marked as started —
    // the four-stage stepper on the detail sheet already presents this as a strict pipeline.
    if (toStatus === 'pending_approval' && task.status !== 'in_progress') {
      toast.error('Move this delegation to In Progress before sending it for review.');
      return;
    }

    // Never commits on its own: the server requires a remark for any status change, and a path
    // that skipped it would both fail and be a way around the rule the detail modal enforces.
    setPendingMove({ task, toStatus });
  }, []);

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
