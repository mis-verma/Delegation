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

// A plain icon square next to grey text reads as unfinished, especially for an alarming status
// like Overdue. The whole pill now picks up a soft tint of the same colour as the icon.
const STATUS_LOOK: Record<string, { frame: string; label: string }> = {
  'bg-danger': { frame: 'border-danger/25 bg-danger/8', label: 'text-danger' },
  'bg-warning': { frame: 'border-warning/25 bg-warning/8', label: 'text-warning' },
  'bg-success': { frame: 'border-success/25 bg-success/8', label: 'text-success' },
  'bg-text-muted': { frame: 'border-border/60 bg-surface-hover/60', label: 'text-text-secondary' },
  'bg-primary-600 dark:bg-primary-400': { frame: 'border-primary-500/25 bg-primary-500/8', label: 'text-primary-700 dark:text-primary-300' },
};

export interface StatusChipProps {
  status: StatusChipStatus;
  label?: ReactNode;
  icon?: LucideIcon | false;
  title?: string;
  className?: string;
  iconOnlyOnMobile?: boolean;
  showLabelOnMobile?: boolean;
  children?: ReactNode;
}

// eslint-disable-next-line react-refresh/only-export-components
export const getStatusChipMeta = (status: StatusChipStatus) => STATUS_CHIP_CONFIG[status];

export const StatusChip = ({ status, label, icon, title, className, iconOnlyOnMobile = false, children }: StatusChipProps) => {
  const config = STATUS_CHIP_CONFIG[status];
  const Icon = icon === false ? false : icon ?? config.icon;
  const look = STATUS_LOOK[config.tone];

  return (
    <IconChip
      icon={Icon}
      tone={config.tone}
      label={label ?? config.label}
      title={title}
      className={cn('shrink-0', look?.frame, className)}
      labelClassName={look?.label}
      iconOnlyOnMobile={iconOnlyOnMobile}
    >
      {children}
    </IconChip>
  );
};
