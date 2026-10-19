import { FileEdit } from 'lucide-react';
import { StatusChip, type StatusChipStatus } from '../../components/statusChip';
import { STATUS_LABEL } from './taskDisplay';
import type { Task } from '../../api/task';

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
