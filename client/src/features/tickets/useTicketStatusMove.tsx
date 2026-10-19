import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { TicketStatusRemarkDialog } from './TicketStatusRemarkDialog';
import { useTicketStatusMoveMutation } from './hook';
import { RESTRICTED_STATUSES, type Ticket, type RestrictedStatus } from '../../api/ticket';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';

export const useTicketStatusMove = () => {
  const moveMutation = useTicketStatusMoveMutation();
  const { user } = useAuth();
  const isVerifier = user?.role === 'ADMIN' || user?.role === 'PC';
  const [pendingMove, setPendingMove] = useState<{ ticket: Ticket; toStatus: RestrictedStatus } | null>(null);

  const canMoveTo = (status: Ticket['status']): status is RestrictedStatus =>
    (RESTRICTED_STATUSES as readonly string[]).includes(status);

  const requestMove = (ticket: Ticket, toStatus: Ticket['status']) => {
    if (ticket.status === toStatus) return;

    if (user && OWN_SCOPE_ROLES.includes(user.role) && ticket.assigneeId !== user.id) {
      toast.error('Only the person working on this ticket can change its status.');
      return;
    }

    if (!isVerifier && (ticket.status === 'CLOSED' || ticket.status === 'PENDING_APPROVAL')) {
      toast.error(ticket.status === 'CLOSED' ? 'This ticket is closed.' : 'This ticket is waiting for approval.', {
        description: ticket.status === 'CLOSED'
          ? 'Only an admin or PC can reopen it.'
          : 'The reviewer can send it back if it needs more work.',
      });
      return;
    }

    if (!canMoveTo(toStatus)) {
      toast.error(toStatus === 'OPEN' ? "A ticket can't be moved back to Open from the board." : "A ticket can't be closed from the board.", {
        description: toStatus === 'OPEN'
          ? 'Open the ticket to move it back.'
          : 'Approve it instead, so the decision is recorded.',
      });
      return;
    }

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
