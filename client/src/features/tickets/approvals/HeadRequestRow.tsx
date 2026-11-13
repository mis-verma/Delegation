import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Ban, CircleCheck, Forward, Hand, ShieldQuestion, Timer, User } from 'lucide-react';
import { Button, DepartmentChip, IconChip, PriorityChip, WaitChip } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { cn } from '@/lib/utils';
import { avatarColorClass } from '../../../lib/avatarColors';
import { getInitials } from '../../../lib/getInitials';
import { haptic } from '../../../lib/haptics';
import { PRIORITY_CONFIG } from '../ticketDisplay';
import { useApproveAssignmentMutation, useAssignableUsersQuery, useDeclineTicketMutation, useDepartmentsQuery, useUpdateTicketMutation } from '../hook';
import { AssigneeField } from '../../assignees/AssigneeField';
import { RedirectTicketDialog } from '../detail/RedirectTicketDialog';
import { DeclineTicketDialog } from '../detail/DeclineTicketDialog';
import { TicketDetail } from '../TicketDetail';
import { TatHoursPicker } from '../claim/TatHoursPicker';
import { headApproveLabel, wholeHours } from '../claim/ticketClaim';
import type { Ticket } from '../../../api/ticket';

interface HeadRequestRowProps {
  ticket: Ticket;
  now: number;
  departmentName?: string;
  embedded?: boolean;
}

export const Avatar = ({ name }: { name: string | null }) =>
  name ? (
    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full t-meta font-bold text-white ${avatarColorClass(name)}`} aria-hidden="true">
      {getInitials(name)}
    </span>
  ) : (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-light" aria-hidden="true">
      <User size={12} />
    </span>
  );

export const HeadRequestRow = ({ ticket, now, departmentName, embedded = false }: HeadRequestRowProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [pickedId, setPickedId] = useState('');
  const [tatHours, setTatHours] = useState<number | null>(() => wholeHours(ticket.tatHours));
  const needsPerson = !ticket.assigneeId;
  const { data: people, isLoading: loadingPeople } = useAssignableUsersQuery(ticket.departmentId ?? undefined, undefined, undefined, needsPerson);
  const { data: departments } = useDepartmentsQuery();
  const redirectMut = useUpdateTicketMutation({ silent: true });
  const approveMut = useApproveAssignmentMutation();
  const declineMut = useDeclineTicketMutation();
  const claimedByOther = !!ticket.headClaimedBy && ticket.headClaimedBy !== user?.id;
  const lockedOut = claimedByOther && user?.role !== 'ADMIN' && user?.role !== 'PC';
  const busy = approveMut.isPending || declineMut.isPending || redirectMut.isPending || lockedOut;

  const raiserName = ticket.raisedBy?.firstName ?? null;
  const assigneeName = ticket.assignee?.firstName ?? null;

  return (
    <div className={cn('flex flex-col gap-3 transition-colors duration-150', embedded ? 'px-4 py-3 sm:px-5' : 'rounded-xl border border-warning/30 bg-warning/5 p-3 hover:border-warning/50 sm:p-4')}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-start gap-3 rounded-lg text-left outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning text-white" aria-hidden="true">
          <ShieldQuestion size={18} strokeWidth={2.3} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="t-card font-display font-semibold leading-snug text-text line-clamp-2 break-words">{ticket.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 t-meta font-display font-semibold text-text-secondary">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Avatar name={raiserName} />
              <span className="truncate">{raiserName ?? 'Someone'}{ticket.raisedByDepartment ? <span className="font-normal text-text-muted">, {ticket.raisedByDepartment}</span> : null}</span>
            </span>
            <ArrowRight size={13} className="shrink-0 text-text-light" strokeWidth={2.5} aria-hidden="true" />
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Avatar name={assigneeName} />
              <span className={`truncate ${assigneeName ? '' : 'text-text-muted'}`}>{assigneeName ?? 'No person yet'}</span>
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />
            {departmentName && <DepartmentChip name={departmentName} />}
            <WaitChip since={ticket.createdAt} now={now} warnAfterHours={4} dangerAfterHours={24} />
            {!!ticket.tatHours && <IconChip icon={Timer} tone="bg-info" label={`${wholeHours(ticket.tatHours)}h asked`} title="Asked for by the sender. You set the final time below" className="shrink-0" labelClassName="tabular-nums" />}
          </span>
        </span>
      </button>

      {claimedByOther && (
        <IconChip icon={Hand} tone="bg-primary-600" label={`Claimed by ${ticket.headClaimer?.firstName ?? 'another head'}`} className="w-fit" />
      )}

      {ticket.assigneeId === user?.id && (
        <p className="t-meta font-display font-semibold text-warning">This ticket is assigned to you. If you approve it, PC can see that you approved your own work.</p>
      )}

      <TatHoursPicker
        value={tatHours}
        onChange={setTatHours}
        disabled={busy}
        hint={needsPerson && !pickedId ? 'The clock starts when someone claims it.' : 'Their clock starts when they claim it.'}
      />

      {needsPerson && (
        <div className="flex flex-col gap-1.5">
          <span className="t-meta font-display font-semibold text-text-secondary">Give it to someone (optional). Leave it empty and anyone in {departmentName ?? 'your team'} can claim it.</span>
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

      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
        <Button
          variant="outline"
          onClick={() => { haptic('tap'); setRedirecting(true); }}
          disabled={busy}
          className="col-span-2 h-11 gap-1.5 font-display font-semibold sm:col-span-1 sm:h-10"
        >
          <Forward size={16} aria-hidden="true" />
          Wrong team
        </Button>
        <Button
          variant="outline"
          onClick={() => { haptic('tap'); setDeclining(true); }}
          disabled={busy}
          className="h-11 gap-1.5 border-danger/40 font-display font-semibold text-danger hover:border-danger hover:bg-danger/10 hover:text-danger sm:h-10"
        >
          <Ban size={16} aria-hidden="true" />
          Decline
        </Button>
        <Button
          variant="primary"
          onClick={() => { if (!tatHours) return; haptic('tap'); approveMut.mutate({ id: ticket.id, tatHours, assigneeId: pickedId || undefined }); }}
          isLoading={approveMut.isPending}
          disabled={busy || !tatHours}
          className="h-11 gap-1.5 bg-success font-display font-semibold text-white hover:from-success/90 hover:to-success/70 hover:text-white sm:h-10"
        >
          <CircleCheck size={16} aria-hidden="true" />
          {headApproveLabel(!needsPerson || !!pickedId)}
        </Button>
      </div>

      <DeclineTicketDialog
        open={declining}
        ticketTitle={ticket.title}
        isPending={declineMut.isPending}
        onCancel={() => setDeclining(false)}
        onConfirm={(reason) => declineMut.mutate({ id: ticket.id, reason }, { onSuccess: () => setDeclining(false) })}
      />

      <RedirectTicketDialog
        open={redirecting}
        ticketTitle={ticket.title}
        currentDepartmentId={ticket.departmentId ?? null}
        departments={departments ?? []}
        isPending={redirectMut.isPending}
        onCancel={() => setRedirecting(false)}
        onConfirm={(departmentId) => redirectMut.mutate(
          { id: ticket.id, payload: { departmentId, assigneeId: null } },
          {
            onSuccess: () => {
              setRedirecting(false);
              toast.success('Sent to the other team. Their head will decide next.');
            },
          },
        )}
      />

      {open && <TicketDetail ticket={ticket} onClose={() => setOpen(false)} />}
    </div>
  );
};
