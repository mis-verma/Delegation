import { FileEdit } from 'lucide-react';
import { StatusChip, type StatusChipStatus } from '../../components/statusChip';
import { STATUS_LABEL } from './taskDisplay';
import type { Task } from '../../api/task';

// Delegation statuses onto the shared chip palette. The labels always come from STATUS_LABEL, so
// every view says "To Do" / "Pending Approval" — List and Table used to borrow the chip's own
// words and showed "Open" / "Pending" for the same two stages the Board calls "To Do" / "Pending
// Approval".
const CHIP_KEY: Record<Task['status'], StatusChipStatus> = {
  draft: 'open',
  todo: 'open',
  in_progress: 'in_progress',
  pending_approval: 'pending_approval',
  done: 'completed',
  on_hold: 'on_hold',
};

export const TaskStatusChip = ({ status, className, iconOnlyOnMobile }: { status: Task['status']; className?: string; iconOnlyOnMobile?: boolean }) => (
  <StatusChip
    status={CHIP_KEY[status]}
    label={STATUS_LABEL[status]}
    icon={status === 'draft' ? FileEdit : undefined}
    className={className}
    iconOnlyOnMobile={iconOnlyOnMobile}
  />
);
