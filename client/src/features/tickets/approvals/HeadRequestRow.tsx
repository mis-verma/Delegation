import { useState } from 'react';
import { ArrowRight, Ban, CircleCheck, Clock3, ShieldQuestion, User } from 'lucide-react';
import { Button, DepartmentChip, PriorityChip } from '../../../components';
import { avatarColorClass } from '../../../lib/avatarColors';
import { getInitials } from '../../../lib/getInitials';
import { formatWaiting } from '../../verification/verificationModel';
import { PRIORITY_CONFIG } from '../ticketDisplay';
import { useApproveAssignmentMutation, useDeclineTicketMutation } from '../hook';
import { DeclineTicketDialog } from '../detail/DeclineTicketDialog';
import { TicketDetail } from '../TicketDetail';
import type { Ticket } from '../../../api/ticket';

interface HeadRequestRowProps {
  ticket: Ticket;
  now: number;
  departmentName?: string;
}

const Avatar = ({ name }: { name: string | null }) =>
  name ? (
    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full t-meta font-bold text-white ${avatarColorClass(name)}`} aria-hidden="true">
      {getInitials(name)}
    </span>
  ) : (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-light" aria-hidden="true">
      <User size={12} />
    </span>
  );

export const HeadRequestRow = ({ ticket, now, departmentName }: HeadRequestRowProps) => {
  const [open, setOpen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const approveMut = useApproveAssignmentMutation();
  const declineMut = useDeclineTicketMutation();
  const busy = approveMut.isPending || declineMut.isPending;

  const raiserName = ticket.raisedBy?.firstName ?? null;
  const assigneeName = ticket.assignee?.firstName ?? null;
  const waiting = formatWaiting(new Date(ticket.createdAt).getTime(), now);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3 transition-colors duration-150 hover:border-warning/50 sm:p-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-start gap-3 rounded-lg text-left outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-warning to-warning/70 text-white" aria-hidden="true">
          <ShieldQuestion size={18} strokeWidth={2.3} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="t-card font-display font-semibold leading-snug text-text line-clamp-2 break-words">{ticket.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 t-meta font-display font-semibold text-text-secondary">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Avatar name={raiserName} />
              <span className="truncate">{raiserName ?? 'Someone'}</span>
            </span>
            <ArrowRight size={13} className="shrink-0 text-text-light" strokeWidth={2.5} aria-hidden="true" />
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Avatar name={assigneeName} />
              <span className={`truncate ${assigneeName ? '' : 'text-text-muted'}`}>{assigneeName ?? 'Nobody picked yet'}</span>
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />
            {departmentName && <DepartmentChip name={departmentName} />}
            <span className="inline-flex items-center gap-1 t-meta font-medium text-text-muted tabular-nums">
              <Clock3 size={12} strokeWidth={2.25} aria-hidden="true" />
              Waiting {waiting}
            </span>
          </span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
        <Button
          variant="outline"
          onClick={() => setDeclining(true)}
          disabled={busy}
          className="h-11 gap-1.5 border-danger/40 font-display font-semibold text-danger hover:border-danger hover:bg-danger/10 hover:text-danger sm:h-10"
        >
          <Ban size={16} aria-hidden="true" />
          Decline
        </Button>
        <Button
          variant="primary"
          onClick={() => approveMut.mutate({ id: ticket.id })}
          isLoading={approveMut.isPending}
          disabled={busy}
          className="h-11 gap-1.5 bg-linear-to-br from-success to-success/80 font-display font-semibold text-white hover:from-success/90 hover:to-success/70 hover:text-white sm:h-10"
        >
          <CircleCheck size={16} aria-hidden="true" />
          Approve
        </Button>
      </div>

      <DeclineTicketDialog
        open={declining}
        ticketTitle={ticket.title}
        isPending={declineMut.isPending}
        onCancel={() => setDeclining(false)}
        onConfirm={(reason) => declineMut.mutate({ id: ticket.id, reason }, { onSuccess: () => setDeclining(false) })}
      />

      {open && <TicketDetail ticket={ticket} onClose={() => setOpen(false)} />}
    </div>
  );
};
