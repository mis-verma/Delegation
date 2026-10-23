import { StatusRemarkDialog } from '../../components/statusRemarkDialog';
import { StatusChip, type StatusChipStatus } from '../../components';
import { STATUS_LABEL } from './taskDisplay';
import { BACK_STATUS, confirmLabelFor } from './taskStatusModel';
import type { Task } from '../../api/task';

interface TaskStatusRemarkDialogProps {
  task: Task;
  toStatus: Task['status'];
  onCancel: () => void;
  onConfirm: (remark: string) => void;
  isSubmitting?: boolean;
  nested?: boolean;
}

const STATUS_CHIP_KEY: Record<Task['status'], StatusChipStatus> = {
  draft: 'open',
  todo: 'open',
  in_progress: 'in_progress',
  pending_approval: 'pending_approval',
  done: 'completed',
  on_hold: 'on_hold',
};

const StatusPill = ({ status }: { status: Task['status'] }) => (
  <StatusChip status={STATUS_CHIP_KEY[status]} label={STATUS_LABEL[status]} />
);

const REMARK_SUGGESTIONS: Record<Task['status'], string[]> = {
  draft: ['Saving as a draft for now'],
  todo: ['Moving back, needs more detail', 'Not started yet'],
  in_progress: ['Started working on it', 'Picked this up today', 'Back on it'],
  pending_approval: ['Finished, ready for review', 'Completed as requested'],
  done: ['Reviewed and approved', 'All good, closing this'],
  on_hold: ['Waiting for parts', 'Waiting for someone else', 'Need manager approval'],
};

const REOPEN_SUGGESTIONS = ['Found a problem after approval', 'More work needed'];

export const TaskStatusRemarkDialog = ({
  task, toStatus, onCancel, onConfirm, isSubmitting, nested,
}: TaskStatusRemarkDialogProps) => (
  <StatusRemarkDialog
    itemTitle={task.title}
    from={<StatusPill status={task.status} />}
    to={<StatusPill status={toStatus} />}
    confirmLabel={confirmLabelFor(task.status, toStatus, STATUS_LABEL[toStatus])}
    optional={toStatus === 'pending_approval'}
    title={toStatus === 'on_hold' ? 'Why is it on hold?' : task.status === 'done' ? 'Why reopen it?' : undefined}
    description={toStatus === 'pending_approval'
      ? 'Add a note for the reviewer if you want to. You can also mark it completed without one.'
      : toStatus === 'on_hold'
        ? 'Everyone working on this delegation will see the reason. The due date keeps running while it is on hold.'
        : task.status === 'done'
        ? `It goes back to ${toStatus === 'todo' ? 'To do' : 'In progress'} and needs approval again. Everyone on it will see the reason.`
        : BACK_STATUS[task.status] === toStatus
        ? 'Say why it is moving back. Everyone working on this delegation will see the note.'
        : "Status changes are recorded on this delegation's timeline for everyone working on it."}
    phoneNote={toStatus === 'on_hold' ? 'The due date keeps running while it is on hold.' : undefined}
    suggestions={task.status === 'done' ? REOPEN_SUGGESTIONS : REMARK_SUGGESTIONS[toStatus]}
    onCancel={onCancel}
    onConfirm={onConfirm}
    isSubmitting={isSubmitting}
    nested={nested}
  />
);
