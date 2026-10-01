import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, ShieldCheck, Tag, Ticket, UserMinus } from 'lucide-react';
import { Button, Combobox, Modal } from '../../../components';
import { useOffboardingQuery, useOffboardUserMutation } from '../hook';
import type { AdminUser } from '../../../api/admin';

interface OffboardDialogProps {
  user: AdminUser;
  /** The whole roster, to pick who takes over. */
  people: AdminUser[];
  onClose: () => void;
}

const nameOf = (u: Pick<AdminUser, 'firstName' | 'lastName'>) => `${u.firstName} ${u.lastName ?? ''}`.trim();

const Line = ({ icon: Icon, children }: { icon: typeof Ticket; children: React.ReactNode }) => (
  <li className="flex items-start gap-2.5 text-sm text-text-secondary">
    <Icon size={15} className="text-text-light shrink-0 mt-0.5" aria-hidden />
    <span>{children}</span>
  </li>
);

/**
 * Switching someone off instead of deleting them. A person who has worked in the system is part of
 * old tickets, tasks, checklists and audits, so they stay on record (name and all) and are only
 * blocked from logging in. What's still open is handed to someone first, so nothing is left with
 * nobody.
 */
export const OffboardDialog = ({ user, people, onClose }: OffboardDialogProps) => {
  const { data: summary, isPending, isError, refetch } = useOffboardingQuery(user.id, true);
  const offboard = useOffboardUserMutation();
  const [takeoverId, setTakeoverId] = useState('');

  // Same store first: a checklist can only go to someone who works in its store.
  const options = useMemo(
    () => people
      .filter(p => p.isActive && p.id !== user.id)
      .sort((a, b) => Number(b.storeId === user.storeId) - Number(a.storeId === user.storeId) || nameOf(a).localeCompare(nameOf(b)))
      .map(p => ({ value: p.id, label: p.storeId === user.storeId ? nameOf(p) : `${nameOf(p)} (other store)` })),
    [people, user.id, user.storeId],
  );

  const needsPerson = !!summary?.hasOpenWork;
  const canConfirm = !!summary && (!needsPerson || !!takeoverId) && !offboard.isPending;

  const confirm = () =>
    offboard.mutate({ id: user.id, transferToUserId: needsPerson ? takeoverId : undefined }, { onSuccess: onClose });

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      <Button type="button" variant="primary" size="sm" onClick={confirm} disabled={!canConfirm} isLoading={offboard.isPending}>
        Deactivate {user.firstName}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={<UserMinus className="w-5 h-5" />}
      title={`Deactivate ${nameOf(user)}?`}
      description="They can no longer log in. Their name stays on everything they worked on."
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 size={15} className="animate-spin" aria-hidden /> Checking what they still hold…
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 text-danger text-xs font-display">
            <AlertCircle size={14} className="shrink-0" aria-hidden />
            <span className="flex-1">We couldn't check their open work.</span>
            <button type="button" onClick={() => refetch()} className="font-semibold underline cursor-pointer">Retry</button>
          </div>
        )}

        {summary && !summary.hasOpenWork && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-text-secondary">
            <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" aria-hidden />
            <span>They have no open tickets, tasks or checklists, so there is nothing to hand over.</span>
          </div>
        )}

        {summary && summary.hasOpenWork && (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-display font-semibold text-text-secondary">Still open with them</p>
              <ul className="flex flex-col gap-2">
                {summary.openTickets > 0 && <Line icon={Ticket}>{summary.openTickets} open ticket{summary.openTickets === 1 ? '' : 's'}</Line>}
                {summary.openTasks > 0 && <Line icon={ClipboardList}>{summary.openTasks} open task{summary.openTasks === 1 ? '' : 's'}</Line>}
                {summary.checklists.length > 0 && (
                  <Line icon={ShieldCheck}>Fills in {summary.checklists.length} checklist{summary.checklists.length === 1 ? '' : 's'}: {summary.checklists.map(c => c.name).join(', ')}</Line>
                )}
                {summary.categories.length > 0 && (
                  <Line icon={Tag}>Receives tickets for {summary.categories.length} categor{summary.categories.length === 1 ? 'y' : 'ies'}: {summary.categories.map(c => c.name).join(', ')}</Line>
                )}
              </ul>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="takeover" className="text-xs font-display font-semibold text-text-secondary">
                Who takes over? <span className="text-danger">*</span>
              </label>
              <Combobox
                id="takeover"
                value={takeoverId}
                onChange={setTakeoverId}
                placeholder="Search people..."
                options={options}
              />
              <p className="text-[11px] text-text-muted">
                A checklist can only go to someone who works in its store.
              </p>
            </div>
          </>
        )}

        {summary && summary.auditQuestions > 0 && (
          <p className="text-xs text-text-muted">
            They are also on {summary.auditQuestions} audit list{summary.auditQuestions === 1 ? '' : 's'} and will be taken off, since nobody is checked once they have left.
          </p>
        )}
      </div>
    </Modal>
  );
};
