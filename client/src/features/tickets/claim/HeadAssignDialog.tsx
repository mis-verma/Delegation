import { useState } from 'react';
import { Hand } from 'lucide-react';
import { Button, Modal } from '../../../components';
import { AssigneeField } from '../../assignees/AssigneeField';
import { useApproveAssignmentMutation, useAssignableUsersQuery } from '../hook';
import { TatHoursPicker } from './TatHoursPicker';
import { headApproveLabel, wholeHours } from './ticketClaim';
import type { Ticket } from '../../../api/ticket';

interface HeadAssignDialogProps {
  ticket: Ticket;
  departmentName?: string;
  onClose: () => void;
}

export const HeadAssignDialog = ({ ticket, departmentName, onClose }: HeadAssignDialogProps) => {
  const approve = useApproveAssignmentMutation();
  const { data: people, isLoading } = useAssignableUsersQuery(ticket.departmentId ?? undefined, undefined, undefined, true);
  const [tatHours, setTatHours] = useState<number | null>(() => wholeHours(ticket.tatHours));
  const [pickedId, setPickedId] = useState(ticket.assigneeId ?? '');
  const hasPerson = !!(pickedId || ticket.assigneeId);

  const save = () => {
    if (!tatHours) return;
    approve.mutate(
      { id: ticket.id, tatHours, assigneeId: pickedId && pickedId !== ticket.assigneeId ? pickedId : undefined },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      icon={<Hand className="size-5" />}
      title="Set the time and give it to someone"
      description={`"${ticket.title}". Leave the person empty and anyone in ${departmentName ?? 'the team'} can claim it.`}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="max-sm:h-11">Cancel</Button>
          <Button type="button" variant="primary" size="sm" disabled={!tatHours} isLoading={approve.isPending} onClick={save} className="max-sm:h-11">
            {headApproveLabel(hasPerson)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TatHoursPicker
          value={tatHours}
          onChange={setTatHours}
          disabled={approve.isPending}
          hint={hasPerson ? 'Their clock starts when they claim it.' : 'The clock starts when someone claims it.'}
        />
        <div className="flex flex-col gap-1.5">
          <span className="t-meta font-display font-semibold text-text-secondary">Who should handle it?</span>
          <AssigneeField
            single
            hideLabel
            selectedIds={pickedId ? [pickedId] : []}
            onChange={(ids) => setPickedId(ids[0] ?? '')}
            users={people}
            isLoading={isLoading}
            emptyText="Nobody is in this team yet."
          />
        </div>
      </div>
    </Modal>
  );
};
