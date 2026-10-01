import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { TicketStatusRemarkDialog } from './TicketStatusRemarkDialog';
import { useTicketStatusMoveMutation } from './hook';
import { RESTRICTED_STATUSES, type Ticket, type RestrictedStatus } from '../../api/ticket';

/**
 * The gate every board-initiated ticket status change goes through.
 *
 * Dragging a ticket used to call the plain update endpoint with `{ status }` and nothing else —
 * so a board move changed the status but wrote no TicketStatusUpdate row and asked for no remark,
 * while the exact same move made from the detail sheet did both. The ticket's own history was
 * missing every drag. This routes drags through the same remark-gated endpoint the sheet uses.
 *
 * Mirrors tasks/useTaskStatusMove.tsx, including returning the dialog as a node so a caller can't
 * render the move UI and forget the gate.
 */
export const useTicketStatusMove = () => {
  const moveMutation = useTicketStatusMoveMutation();
  const [pendingMove, setPendingMove] = useState<{ ticket: Ticket; toStatus: RestrictedStatus } | null>(null);

  /** True when this target can be reached by a remark-gated move. */
  const canMoveTo = (status: Ticket['status']): status is RestrictedStatus =>
    (RESTRICTED_STATUSES as readonly string[]).includes(status);

  const requestMove = (ticket: Ticket, toStatus: Ticket['status']) => {
    if (ticket.status === toStatus) return;

    // `TicketStatusUpdate.toStatus` is a MySQL enum of exactly IN_PROGRESS/ON_HOLD/PENDING_APPROVAL,
    // so a move back to Open literally cannot be recorded. Rather than let it through unlogged —
    // the bug this whole flow exists to close — it's refused with the reason.
    if (!canMoveTo(toStatus)) {
      toast.error(`A ticket can't be moved back to ${toStatus === 'OPEN' ? 'Open' : 'Closed'} from the board.`, {
        description: toStatus === 'OPEN'
          ? 'Reopening is not a recordable status change. Use the ticket sheet.'
          : 'Closing happens through verification so the approval is recorded.',
      });
      return;
    }

    // Only On Hold asks why. In Progress and Completed (which sends it to PC for approval) are one
    // tap, so a drag onto those columns goes straight through, still recorded in the ticket's history.
    if (toStatus !== 'ON_HOLD') {
      moveMutation.mutate({ id: ticket.id, payload: { status: toStatus } });
      return;
    }

    setPendingMove({ ticket, toStatus });
  };

  const statusRemarkDialog: ReactNode = pendingMove && (
    <TicketStatusRemarkDialog
      ticket={pendingMove.ticket}
      toStatus={pendingMove.toStatus}
      isSubmitting={moveMutation.isPending}
      onCancel={() => setPendingMove(null)}
      onConfirm={(remark) => {
        moveMutation.mutate(
          { id: pendingMove.ticket.id, payload: { status: pendingMove.toStatus, remark } },
          { onSuccess: () => setPendingMove(null) },
        );
      }}
    />
  );

  return { requestMove, statusRemarkDialog };
};
