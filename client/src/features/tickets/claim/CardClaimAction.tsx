import { useState } from 'react';
import { Hand } from 'lucide-react';
import { Button, useConfirm } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { haptic } from '../../../lib/haptics';
import { useClaimTicketMutation, useHeadClaimTicketMutation } from '../hook';
import { HeadAssignDialog } from './HeadAssignDialog';
import { canClaim, canHeadDecide, tatText } from './ticketClaim';
import type { Ticket } from '../../../api/ticket';

interface CardClaimActionProps {
  ticket: Ticket;
  departmentName?: string;
}

export const CardClaimAction = ({ ticket, departmentName }: CardClaimActionProps) => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const claim = useClaimTicketMutation();
  const headClaim = useHeadClaimTicketMutation();
  const [assigning, setAssigning] = useState(false);

  const mine = canClaim(user, ticket);
  const head = canHeadDecide(user, ticket);
  const claimedByMe = !!user && ticket.headClaimedBy === user.id;
  const time = tatText(ticket.tatHours);

  const takeIt = async () => {
    const ok = await confirm({
      title: 'Claim this ticket?',
      description: `It becomes yours and the clock starts now.${time ? ` You have ${time} to finish it.` : ''}`,
      confirmLabel: 'Claim it',
    });
    if (!ok) return;
    haptic('tap');
    claim.mutate({ id: ticket.id });
  };

  const takeCharge = () => {
    haptic('tap');
    headClaim.mutate({ id: ticket.id }, { onSuccess: () => setAssigning(true) });
  };

  if (mine) {
    return (
      <Button variant="primary" size="sm" isLoading={claim.isPending} onClick={() => { void takeIt(); }} className="h-9 shrink-0 font-display font-semibold max-sm:h-11">
        {!claim.isPending && <Hand size={14} aria-hidden />}
        Claim
      </Button>
    );
  }

  if (!head) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        isLoading={headClaim.isPending}
        onClick={() => (claimedByMe ? setAssigning(true) : takeCharge())}
        className="h-9 shrink-0 font-display font-semibold max-sm:h-11"
      >
        {!headClaim.isPending && <Hand size={14} aria-hidden />}
        {claimedByMe ? 'Assign' : 'Claim and assign'}
      </Button>
      {assigning && <HeadAssignDialog ticket={ticket} departmentName={departmentName} onClose={() => setAssigning(false)} />}
    </>
  );
};
