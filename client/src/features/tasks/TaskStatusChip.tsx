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

export const TaskStatusChip = ({ status, declined = false, className, iconOnlyOnMobile }: { status: Task['status']; declined?: boolean; className?: string; iconOnlyOnMobile?: boolean }) => (
  <StatusChip
    status={declined ? 'declined' : CHIP_KEY[status]}
    label={declined ? 'Declined' : STATUS_LABEL[status]}
    icon={status === 'draft' && !declined ? FileEdit : undefined}
    className={className}
    iconOnlyOnMobile={iconOnlyOnMobile}
  />
);
