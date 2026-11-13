import { Hand, Hourglass } from 'lucide-react';
import { Button, useConfirm } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { haptic } from '../../../lib/haptics';
import type { Ticket } from '../../../api/ticket';
import { useClaimTicketMutation } from '../hook';
import { canClaim, isAwaitingAssigneeClaim, tatText } from './ticketClaim';

interface ClaimBannerProps {
  ticket: Ticket;
  departmentName?: string;
}

const bannerCopy = (ticket: Ticket, mine: boolean, departmentName: string | undefined, time: string | null) => {
  const clock = time ? `${time} to finish, counted from the claim.` : 'The clock starts at the claim.';
  if (isAwaitingAssigneeClaim(ticket)) {
    const giver = ticket.headClaimer?.firstName ?? ticket.assignmentApprover?.firstName;
    return mine
      ? { title: 'Given to you. Claim it to start', text: `${giver ? `${giver} gave you this ticket. ` : ''}${clock}` }
      : { title: `Waiting for ${ticket.assignee?.firstName ?? 'the assignee'} to claim it`, text: clock };
  }
  return mine
    ? { title: 'Open for you to claim', text: `${clock} First to claim gets it.` }
    : { title: `Waiting for someone in ${departmentName ?? 'the department'} to claim it`, text: clock };
};

export const ClaimBanner = ({ ticket, departmentName }: ClaimBannerProps) => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const claimMut = useClaimTicketMutation();
  const mine = canClaim(user, ticket);
  const time = tatText(ticket.tatHours);
  const copy = bannerCopy(ticket, mine, departmentName, time);

  const claim = async () => {
    const ok = await confirm({
      title: 'Claim this ticket?',
      description: `It becomes yours and the clock starts now.${time ? ` You have ${time} to finish it.` : ''}`,
      confirmLabel: 'Claim it',
    });
    if (!ok) return;
    haptic('tap');
    claimMut.mutate({ id: ticket.id });
  };

  return (
    <section aria-label="Waiting to be claimed" className="flex flex-col gap-3 rounded-xl border border-primary-500/30 bg-primary-500/5 p-3.5 sm:flex-row sm:items-center sm:p-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white" aria-hidden="true">
          {mine ? <Hand size={19} strokeWidth={2.3} /> : <Hourglass size={18} strokeWidth={2.3} />}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="t-section font-display font-bold leading-snug text-text">{copy.title}</h2>
          <p className="t-card font-medium leading-snug text-text-secondary">{copy.text}</p>
        </div>
      </div>
      {mine && (
        <Button
          variant="primary"
          onClick={() => { void claim(); }}
          isLoading={claimMut.isPending}
          className="h-11 shrink-0 gap-1.5 font-display font-semibold sm:h-10"
        >
          {!claimMut.isPending && <Hand size={16} aria-hidden="true" />}
          Claim it
        </Button>
      )}
    </section>
  );
};
