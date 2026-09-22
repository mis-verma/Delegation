import { StatusRemarkDialog } from '../../components/statusRemarkDialog';
import { Badge } from '../../components/ui/badge';
import { STATUS_LABEL, STATUS_CONFIG } from './taskDisplay';
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

const StatusPill = ({ status }: { status: Task['status'] }) => (
  <Badge variant="outline" className={`text-[10px] ${STATUS_CONFIG[status].badge}`}>
    {STATUS_LABEL[status]}
  </Badge>
);

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
    confirmLabel={`Move to ${STATUS_LABEL[toStatus]}`}
    description="Status changes are recorded on this delegation's timeline for everyone working on it."
    onCancel={onCancel}
    onConfirm={onConfirm}
    isSubmitting={isSubmitting}
    nested={nested}
  />
);
