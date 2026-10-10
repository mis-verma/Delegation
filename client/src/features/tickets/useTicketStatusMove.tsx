import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { TicketStatusRemarkDialog } from './TicketStatusRemarkDialog';
import { useTicketStatusMoveMutation } from './hook';
import { RESTRICTED_STATUSES, type Ticket, type RestrictedStatus } from '../../api/ticket';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';

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
  const { user } = useAuth();
  const isVerifier = user?.role === 'ADMIN' || user?.role === 'PC';
  const [pendingMove, setPendingMove] = useState<{ ticket: Ticket; toStatus: RestrictedStatus } | null>(null);

  /** True when this target can be reached by a remark-gated move. */
  const canMoveTo = (status: Ticket['status']): status is RestrictedStatus =>
    (RESTRICTED_STATUSES as readonly string[]).includes(status);

  const requestMove = (ticket: Ticket, toStatus: Ticket['status']) => {
    if (ticket.status === toStatus) return;

    // Same rule as the server: front-line staff only move tickets they are working on themselves.
    if (user && OWN_SCOPE_ROLES.includes(user.role) && ticket.assigneeId !== user.id) {
      toast.error('Only the person working on this ticket can change its status.');
      return;
    }

    // Same rule as the server: closed is final, and handed-in work waits for the reviewer.
    if (!isVerifier && (ticket.status === 'CLOSED' || ticket.status === 'PENDING_APPROVAL')) {
      toast.error(ticket.status === 'CLOSED' ? 'This ticket is closed.' : 'This ticket is waiting for approval.', {
        description: ticket.status === 'CLOSED'
          ? 'Only an admin or PC can reopen it.'
          : 'The reviewer can send it back if it needs more work.',
      });
      return;
    }

    // `TicketStatusUpdate.toStatus` is a MySQL enum of exactly IN_PROGRESS/ON_HOLD/PENDING_APPROVAL,
    // so a move back to Open literally cannot be recorded. Rather than let it through unlogged —
    // the bug this whole flow exists to close — it's refused with the reason.
    if (!canMoveTo(toStatus)) {
      toast.error(toStatus === 'OPEN' ? "A ticket can't be moved back to Open from the board." : "A ticket can't be closed from the board.", {
        description: toStatus === 'OPEN'
          ? 'Open the ticket to move it back.'
          : 'Approve it instead, so the decision is recorded.',
      });
      return;
    }

    // On Hold must be explained and Completed (which sends it to PC for approval) opens a small popup
    // where the note is optional. In Progress is one tap, so a drag onto that column goes straight
    // through, still recorded in the ticket's history.
    if (toStatus !== 'ON_HOLD' && toStatus !== 'PENDING_APPROVAL') {
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
          { id: pendingMove.ticket.id, payload: { status: pendingMove.toStatus, remark: remark || undefined } },
          { onSuccess: () => setPendingMove(null) },
        );
      }}
    />
  );

  return { requestMove, statusRemarkDialog };
};
