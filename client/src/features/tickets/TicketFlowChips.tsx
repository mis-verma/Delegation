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
        <IconChip icon={BellRing} tone="bg-linear-to-br from-warning to-warning/70" label="Needs your decision" className="border-warning/40 bg-warning/15" labelClassName="text-warning" />
      ) : (
        <IconChip icon={ShieldQuestion} tone="bg-warning" label="Head approval" className="border-warning/30 bg-warning/10" labelClassName="text-warning" />
      ))}
      {headApproved && (
        <IconChip
          icon={ShieldCheck}
          tone="bg-success"
          label="Head approved"
          title={`Approved by ${ticket.assignmentApprover?.firstName ?? 'the department head'}`}
          className="border-success/30 bg-success/10"
          labelClassName="text-success"
        />
      )}
      {lastTouch && look && (
        <IconChip icon={History} tone={look.tone} label={`Updated ${timeAgo(lastTouch, now)}`} className={look.chip} labelClassName={look.text} />
      )}
    </>
  );
};
