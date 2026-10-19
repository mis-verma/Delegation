import type { ReactNode } from 'react';
import { Ban, Clock, PauseCircle, CheckCircle2, CircleDot, Eye } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconChip } from '../iconChip';
import { cn } from '../../lib/utils';

export type StatusChipStatus =
  | 'due'
  | 'overdue'
  | 'on_hold'
  | 'open'
  | 'in_progress'
  | 'in_review'
  | 'pending'
  | 'pending_approval'
  | 'completed'
  | 'closed'
  | 'declined';

interface StatusChipConfig {
  label: string;
  tone: string;
  icon: LucideIcon;
}

const STATUS_CHIP_CONFIG: Record<StatusChipStatus, StatusChipConfig> = {
  due: { label: 'Due', tone: 'bg-warning', icon: Clock },
  overdue: { label: 'Overdue', tone: 'bg-danger', icon: Clock },
  on_hold: { label: 'On Hold', tone: 'bg-text-muted', icon: PauseCircle },
  open: { label: 'Open', tone: 'bg-text-muted', icon: CircleDot },
  in_progress: { label: 'In Progress', tone: 'bg-warning', icon: Clock },
  in_review: { label: 'In Review', tone: 'bg-primary-600 dark:bg-primary-400', icon: Eye },
  pending: { label: 'Pending', tone: 'bg-text-muted', icon: Clock },
  pending_approval: { label: 'Pending Approval', tone: 'bg-primary-600 dark:bg-primary-400', icon: Eye },
  completed: { label: 'Completed', tone: 'bg-success', icon: CheckCircle2 },
  closed: { label: 'Closed', tone: 'bg-success', icon: CheckCircle2 },
  declined: { label: 'Declined', tone: 'bg-danger', icon: Ban },
};

export interface StatusChipProps {
  status: StatusChipStatus;
  label?: ReactNode;
  icon?: LucideIcon | false;
  className?: string;
  iconOnlyOnMobile?: boolean;
  showLabelOnMobile?: boolean;
  children?: ReactNode;
}

// eslint-disable-next-line react-refresh/only-export-components
export const getStatusChipMeta = (status: StatusChipStatus) => STATUS_CHIP_CONFIG[status];

export const StatusChip = ({ status, label, icon, className, iconOnlyOnMobile = false, children }: StatusChipProps) => {
  const config = STATUS_CHIP_CONFIG[status];
  const Icon = icon === false ? false : icon ?? config.icon;

  return (
    <IconChip icon={Icon} tone={config.tone} label={label ?? config.label} className={cn('shrink-0', className)} iconOnlyOnMobile={iconOnlyOnMobile}>
      {children}
    </IconChip>
  );
};
