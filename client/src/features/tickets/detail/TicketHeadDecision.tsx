import { useState } from 'react';
import type { Ticket } from '../../../api/ticket';
import { useAuth } from '../../../context/AuthContext';
import { AssigneeField } from '../../assignees/AssigneeField';
import { useApproveAssignmentMutation, useAssignableUsersQuery, useHeadClaimTicketMutation } from '../hook';
import { TatHoursPicker } from '../claim/TatHoursPicker';
import { headApproveLabel, wholeHours } from '../claim/ticketClaim';
import { HeadDecisionPanel } from './HeadDecisionPanel';

interface TicketHeadDecisionProps {
  ticket: Ticket;
  departmentName?: string;
  canDecide: boolean;
  isDeclining: boolean;
  onDecline: () => void;
}

export const TicketHeadDecision = ({ ticket, departmentName, canDecide, isDeclining, onDecline }: TicketHeadDecisionProps) => {
  const { user } = useAuth();
  const approveMut = useApproveAssignmentMutation();
  const claimMut = useHeadClaimTicketMutation();
  const orgWide = user?.role === 'ADMIN' || user?.role === 'PC';
  const claimedByMe = !!user && ticket.headClaimedBy === user.id;
  const claimedByOther = !!ticket.headClaimedBy && !claimedByMe;
  const mayAssign = canDecide && (claimedByMe || (claimedByOther && orgWide));
  const { data: people, isLoading: loadingPeople } = useAssignableUsersQuery(ticket.departmentId ?? undefined, undefined, undefined, mayAssign);
  const [tatHours, setTatHours] = useState<number | null>(() => wholeHours(ticket.tatHours));
  const [pickedId, setPickedId] = useState(ticket.assigneeId ?? '');
  const hasPerson = !!(pickedId || ticket.assigneeId);
  const raiserName = ticket.raisedBy?.firstName ?? 'Someone';
  const claimerName = ticket.headClaimer?.firstName ?? 'Another head';

  const approve = () => {
    if (!tatHours) return;
    approveMut.mutate({ id: ticket.id, tatHours, assigneeId: pickedId && pickedId !== ticket.assigneeId ? pickedId : undefined });
  };

  return (
    <HeadDecisionPanel
      itemTitle={ticket.title}
      raiser={ticket.raisedBy ?? null}
      assignee={pickedId ? people?.find((p) => p.id === pickedId) ?? ticket.assignee : ticket.assignee}
      departmentName={departmentName}
      canDecide={canDecide && (!claimedByOther || orgWide)}
      isApproving={approveMut.isPending}
      isDeclining={isDeclining}
      onApprove={approve}
      onDecline={onDecline}
      approveLabel={headApproveLabel(hasPerson)}
      approveDisabled={!tatHours}
      claim={{
        claimedBy: ticket.headClaimedBy ? (claimedByMe ? 'you' : claimerName) : null,
        canClaim: canDecide && !ticket.headClaimedBy,
        isClaiming: claimMut.isPending,
        onClaim: () => claimMut.mutate({ id: ticket.id }),
      }}
      decideText={claimedByMe
        ? `You claimed "${ticket.title}". Set how long it gets, then give it to someone or let your team claim it.`
        : `${raiserName} sent "${ticket.title}" to ${departmentName ?? 'your department'}. Claim it to take charge, then assign it.`}
    >
      {mayAssign && (
        <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-surface p-3 sm:p-4">
          <TatHoursPicker
            value={tatHours}
            onChange={setTatHours}
            disabled={approveMut.isPending}
            hint={hasPerson ? 'Their clock starts when they claim it.' : 'The clock starts when someone claims it.'}
          />
          <div className="flex flex-col gap-1.5">
            <span className="t-meta font-display font-semibold text-text-secondary">
              Give it to someone. Leave it empty and anyone in {departmentName ?? 'your team'} can claim it.
            </span>
            <AssigneeField
              single
              hideLabel
              selectedIds={pickedId ? [pickedId] : []}
              onChange={(ids) => setPickedId(ids[0] ?? '')}
              users={people}
              isLoading={loadingPeople}
              emptyText="Nobody is in this team yet."
            />
          </div>
        </div>
      )}
    </HeadDecisionPanel>
  );
};
