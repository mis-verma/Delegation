import { useState } from 'react';
import type { Ticket } from '../../../api/ticket';
import { AssigneeField } from '../../assignees/AssigneeField';
import { useApproveAssignmentMutation, useAssignableUsersQuery } from '../hook';
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
  const approveMut = useApproveAssignmentMutation();
  const needsPerson = !ticket.assigneeId;
  const { data: people, isLoading: loadingPeople } = useAssignableUsersQuery(ticket.departmentId ?? undefined, undefined, undefined, canDecide && needsPerson);
  const [tatHours, setTatHours] = useState<number | null>(() => wholeHours(ticket.tatHours));
  const [pickedId, setPickedId] = useState('');
  const hasPerson = !needsPerson || !!pickedId;
  const raiserName = ticket.raisedBy?.firstName ?? 'Someone';

  return (
    <HeadDecisionPanel
      itemTitle={ticket.title}
      raiser={ticket.raisedBy ?? null}
      assignee={ticket.assignee}
      departmentName={departmentName}
      canDecide={canDecide}
      isApproving={approveMut.isPending}
      isDeclining={isDeclining}
      onApprove={() => { if (tatHours) approveMut.mutate({ id: ticket.id, tatHours, assigneeId: pickedId || undefined }); }}
      onDecline={onDecline}
      approveLabel={headApproveLabel(hasPerson)}
      approveDisabled={!tatHours}
      decideStepLabel="Head sets time"
      decideText={`${raiserName} sent "${ticket.title}". Set how long it gets, then give it to someone or let your team claim it.`}
    >
      <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-surface p-3 sm:p-4">
        <TatHoursPicker
          value={tatHours}
          onChange={setTatHours}
          disabled={approveMut.isPending}
          hint={hasPerson ? 'The clock starts as soon as you confirm.' : 'The clock starts when someone claims it.'}
        />
        {needsPerson && (
          <div className="flex flex-col gap-1.5">
            <span className="t-meta font-display font-semibold text-text-secondary">
              Give it to someone (optional). Leave it empty and anyone in {departmentName ?? 'your team'} can claim it.
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
        )}
      </div>
    </HeadDecisionPanel>
  );
};
