import { BellRing, History, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { IconChip } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { isDepartmentHead } from '../../lib/ticketApproval';
import { FRESHNESS_LOOK, freshnessOf, lastWorkTouchOf, timeAgo } from '../../lib/ticketProgress';
import { useSharedNow } from '../../lib/useSharedNow';
import type { Ticket } from '../../api/ticket';

interface TicketFlowChipsProps {
  ticket: Ticket;
  showFreshness?: boolean;
}

export const TicketFlowChips = ({ ticket, showFreshness = true }: TicketFlowChipsProps) => {
  const { user } = useAuth();
  const now = useSharedNow();

  const declined = !!ticket.declinedAt;
  const awaiting = !!ticket.awaitingHeadApproval && !declined;
  const needsMyDecision = awaiting && !!user && (user.role === 'ADMIN' || user.role === 'PC' || isDepartmentHead(user, ticket));
  const headApproved = !awaiting && !declined && !!ticket.assignmentApprovedAt && ticket.status !== 'CLOSED';
  const working = ticket.status === 'IN_PROGRESS' && !declined && !awaiting;
  const lastTouch = showFreshness && working ? lastWorkTouchOf(ticket) : null;
  const look = lastTouch ? FRESHNESS_LOOK[freshnessOf(lastTouch, now)] : null;

  return (
    <>
      {awaiting && (needsMyDecision ? (
        <IconChip icon={BellRing} tone="bg-warning" label="Needs your decision" labelClassName="text-warning" />
      ) : (
        <IconChip icon={ShieldQuestion} tone="bg-warning" label="Waiting for head" labelClassName="text-warning" />
      ))}
      {headApproved && (
        <IconChip
          icon={ShieldCheck}
          tone="bg-success"
          label="Head approved"
          title={`Approved by ${ticket.assignmentApprover?.firstName ?? 'the department head'}`}
          labelClassName="text-success"
        />
      )}
      {lastTouch && look && (
        <IconChip icon={History} tone={look.tone} label={`Updated ${timeAgo(lastTouch, now)}`} labelClassName={look.text} />
      )}
    </>
  );
};
