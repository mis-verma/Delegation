import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, ShieldCheck, Tag, Ticket, TriangleAlert, UserMinus } from 'lucide-react';
import { Button, Combobox, InlineError, Modal, NoticeBanner } from '../../../components';
import { useOffboardingQuery, useOffboardUserMutation } from '../hook';
import type { AdminUser } from '../../../api/admin';
import { isDepartmentHead } from '../roleBadge';
import { FormField } from './FormField';
import { fullName } from './userDisplay';

interface OffboardDialogProps {
  user: AdminUser;
  people: AdminUser[];
  departmentName?: string;
  onClose: () => void;
}

const Line = ({ icon: Icon, children }: { icon: typeof Ticket; children: React.ReactNode }) => (
  <li className="flex items-start gap-2.5 text-sm text-text-secondary">
    <Icon size={15} className="text-text-light shrink-0 mt-0.5" aria-hidden />
    <span>{children}</span>
  </li>
);

export const OffboardDialog = ({ user, people, departmentName, onClose }: OffboardDialogProps) => {
  const { data: summary, isPending, isError, refetch } = useOffboardingQuery(user.id, true);
  const offboard = useOffboardUserMutation();
  const [takeoverId, setTakeoverId] = useState('');

  const holdsChecklists = (summary?.checklists.length ?? 0) > 0;

  const options = useMemo(
    () => people
      .filter((p) => p.isActive && p.id !== user.id)
      .sort((a, b) => Number(b.storeId === user.storeId) - Number(a.storeId === user.storeId) || fullName(a).localeCompare(fullName(b)))
      .map((p) => {
        const sameStore = p.storeId === user.storeId;
        const suffix = sameStore ? '' : holdsChecklists ? ' (other store, cannot take checklists)' : ' (other store)';
        return { value: p.id, label: `${fullName(p)}${suffix}` };
      }),
    [people, user.id, user.storeId, holdsChecklists],
  );

  const takeover = people.find((p) => p.id === takeoverId);
  const takeoverBlocked = !!takeover && holdsChecklists && takeover.storeId !== user.storeId;

  const leavesNoHead = useMemo(
    () => isDepartmentHead(user.role) && !!user.departmentId &&
      !people.some((p) => p.id !== user.id && p.isActive && p.departmentId === user.departmentId && isDepartmentHead(p.role)),
    [people, user],
  );

  const needsPerson = !!summary?.hasOpenWork;
  const canConfirm = !!summary && (!needsPerson || (!!takeoverId && !takeoverBlocked)) && !offboard.isPending;

  const confirm = () =>
    offboard.mutate({ id: user.id, transferToUserId: needsPerson ? takeoverId : undefined }, { onSuccess: onClose });

  const requestClose = () => {
    if (!offboard.isPending) onClose();
  };

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={requestClose} disabled={offboard.isPending}>Cancel</Button>
      <Button type="button" variant="primary" size="sm" onClick={confirm} disabled={!canConfirm} isLoading={offboard.isPending}>
        Deactivate {user.firstName}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={requestClose}
      size="md"
      icon={<UserMinus className="w-5 h-5" />}
      title={`Deactivate ${fullName(user)}?`}
      description="They can no longer log in. Their name stays on everything they worked on. You can switch them back on later."
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {leavesNoHead && (
          <NoticeBanner tone="warning" icon={TriangleAlert}>
            {departmentName ?? 'This department'} will have no head. Nobody will be left to see and approve its team’s work until you make someone else Manager or Senior there.
          </NoticeBanner>
        )}

        {isPending && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 size={15} className="animate-spin" aria-hidden /> Checking what they still hold…
          </div>
        )}

        {isError && <InlineError message="We couldn’t check their open work." onRetry={() => refetch()} />}

        {summary && !summary.hasOpenWork && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-text-secondary">
            <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" aria-hidden />
            <span>They have no open tickets, tasks or checklists, so there is nothing to hand over.</span>
          </div>
        )}

        {summary && summary.hasOpenWork && (
          <>
            <div className="flex flex-col gap-2">
              <p className="t-meta font-display font-semibold text-text-secondary">Still open with them</p>
              <ul className="flex flex-col gap-2">
                {summary.openTickets > 0 && <Line icon={Ticket}>{summary.openTickets} open ticket{summary.openTickets === 1 ? '' : 's'}</Line>}
                {summary.openTasks > 0 && <Line icon={ClipboardList}>{summary.openTasks} open task{summary.openTasks === 1 ? '' : 's'}</Line>}
                {summary.checklists.length > 0 && (
                  <Line icon={ShieldCheck}>Fills in {summary.checklists.length} checklist{summary.checklists.length === 1 ? '' : 's'}: {summary.checklists.map((c) => c.name).join(', ')}</Line>
                )}
                {summary.categories.length > 0 && (
                  <Line icon={Tag}>Receives tickets for {summary.categories.length} categor{summary.categories.length === 1 ? 'y' : 'ies'}: {summary.categories.map((c) => c.name).join(', ')}</Line>
                )}
              </ul>
            </div>

            <FormField
              htmlFor="takeover"
              label={<>Who takes over? <span className="text-danger">*</span></>}
              hint={holdsChecklists ? 'A checklist can only go to someone who works in its store.' : undefined}
              error={takeoverBlocked ? 'They fill in checklists, so pick someone from their store.' : undefined}
            >
              <Combobox
                id="takeover"
                value={takeoverId}
                onChange={setTakeoverId}
                placeholder="Search people..."
                options={options}
              />
            </FormField>
            {options.length === 0 && (
              <p className="t-meta text-text-muted">There is nobody else active to take over. Add or reactivate someone first.</p>
            )}
          </>
        )}

        {summary && summary.auditQuestions > 0 && (
          <p className="t-meta text-text-muted">
            They are also on {summary.auditQuestions} audit list{summary.auditQuestions === 1 ? '' : 's'} and will be taken off, since nobody is checked once they have left.
          </p>
        )}
      </div>
    </Modal>
  );
};
