import { StatusRemarkDialog } from '../../components/statusRemarkDialog';
import { StatusChip, type StatusChipStatus } from '../../components';
import { STATUS_LABEL } from './taskDisplay';
import { BACK_STATUS, confirmLabelFor } from './taskStatusModel';
import type { Task } from '../../api/task';

interface TaskStatusRemarkDialogProps {
  task: Task;
  /** The status being moved to. Rendering is driven entirely by this, so one dialog serves the
   *  detail modal's "Advance" button, a board drag and a card's "Move to" menu. */
  toStatus: Task['status'];
  onCancel: () => void;
  onConfirm: (remark: string) => void;
  isSubmitting?: boolean;
  /** True when opening on top of another Modal — see StatusRemarkDialog for why that matters. */
  nested?: boolean;
}

// Same StatusChip (icon circle + bold label) the delegation list cards use, so the from → to in
// this dialog reads as the exact chips the person just tapped past — was a flat outline Badge.
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

// One-tap remark starters per destination — the common sentences people type when moving a
// delegation to that stage. They fill the box and stay editable.
const REMARK_SUGGESTIONS: Record<Task['status'], string[]> = {
  draft: ['Saving as a draft for now'],
  todo: ['Moving back — needs more detail', 'Not started yet'],
  in_progress: ['Started working on it', 'Picked this up today', 'Waiting on another team'],
  pending_approval: ['Done — ready for review', 'Completed as requested'],
  done: ['Reviewed and approved', 'All good, closing this'],
  on_hold: ['Waiting on another team', 'Waiting for information', 'Blocked, needs a decision'],
};

/**
 * Delegation's wording and status chips over the shared StatusRemarkDialog.
 *
 * The form, validation and character limit used to live here; Tickets then needed the identical
 * dialog, and a second copy is how two flows that must behave the same start behaving differently.
 */
export const TaskStatusRemarkDialog = ({
  task, toStatus, onCancel, onConfirm, isSubmitting, nested,
}: TaskStatusRemarkDialogProps) => (
  <StatusRemarkDialog
    itemTitle={task.title}
    from={<StatusPill status={task.status} />}
    to={<StatusPill status={toStatus} />}
    confirmLabel={confirmLabelFor(task.status, toStatus, STATUS_LABEL[toStatus])}
    optional={toStatus === 'pending_approval'}
    description={toStatus === 'pending_approval'
      ? 'Add a note for the reviewer if you want to. You can also send it for review without one.'
      : toStatus === 'on_hold'
        ? 'Say why this is on hold. Everyone working on this delegation will see the reason, and the due date keeps running.'
        : BACK_STATUS[task.status] === toStatus
        ? 'Say why it is moving back. Everyone working on this delegation will see the note.'
        : "Status changes are recorded on this delegation's timeline for everyone working on it."}
    suggestions={REMARK_SUGGESTIONS[toStatus]}
    onCancel={onCancel}
    onConfirm={onConfirm}
    isSubmitting={isSubmitting}
    nested={nested}
  />
);
