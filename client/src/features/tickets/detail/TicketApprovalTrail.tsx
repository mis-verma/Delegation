import { ApprovalTrail } from '../../../components/approvalTrail/ApprovalTrail';
import { stageOf } from '../../../lib/ticketApproval';
import type { Ticket } from '../../../api/ticket';

const personName = (p: { firstName: string; lastName?: string | null } | null | undefined) =>
  p ? `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}` : null;

export const TicketApprovalTrail = ({ ticket }: { ticket: Ticket }) => (
  <ApprovalTrail
    pending={ticket.status === 'PENDING_APPROVAL'}
    closed={ticket.status === 'CLOSED' && !!ticket.verifiedAt}
    stage={stageOf(ticket)}
    submittedAt={ticket.submittedAt}
    hodApprovedAt={ticket.hodApprovedAt}
    hodName={personName(ticket.hodApprover)}
    finalAt={ticket.verifiedAt ?? ticket.closedAt}
    finalName={personName(ticket.verifier)}
    hideHead
  />
);
