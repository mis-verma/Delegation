import type { ReactNode } from 'react';
import { Clock, PauseCircle, CheckCircle2, CircleDot, Eye } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconChip } from '../iconChip';

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
  | 'closed';

interface StatusChipConfig {
  label: string;
  /** Solid bg-* class for the chip's icon circle — see IconChip. */
  tone: string;
  icon: LucideIcon;
}

// Single source of truth for every "lifecycle status" chip in the app (Due / Overdue / On Hold /
// Open / In Progress / etc.) — tasks, tickets, and checklists were each hand-rolling their own
// version of the same pill (some via Badge, some via a raw <span>), which is how ticket status
// chips ended up on invalid classes like `text-warning-700` (not a real token) that silently
// rendered with no color at all in light mode.
//
// `pending_approval` was missing entirely until it was added here — every ticket status cast
// (`ticket.status.toLowerCase() as StatusChipStatus`) silently produced `'pending_approval'` once
// tickets' single-stage verify rework renamed their review status from `IN_REVIEW`, and this map
// was never updated to match. `STATUS_CHIP_CONFIG[status]` then came back `undefined` for any
// ticket actually in that status, which crashed the whole board/table/detail render the moment one
// existed (`config.icon`/`config.tone` on `undefined`) — not a cosmetic gap, a live outage for the
// app's central verification stage.
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
};

export interface StatusChipProps {
  status: StatusChipStatus;
  /** Override the default label (e.g. a live "Mark 40%" instead of a static word). */
  label?: ReactNode;
  /** Pass `false` to hide the icon circle, or a different Lucide icon to override the default. */
  icon?: LucideIcon | false;
  className?: string;
  /** Extra trailing content inside the chip (e.g. a lock icon marking the status read-only). */
  children?: ReactNode;
}

/** The chip's default label for a status — for a caller that needs the plain word itself
 *  (e.g. to feed into role-based label overrides) rather than the rendered chip. Exported
 *  alongside the component like badge.tsx's own badgeVariants — only affects Fast Refresh
 *  granularity, not runtime correctness.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const getStatusChipLabel = (status: StatusChipStatus) => STATUS_CHIP_CONFIG[status].label;

/** Icon + solid tone for a status, for menus that draw the chip's icon circle next to a plain
 *  label instead of a whole chip (e.g. the ticket sheet's status menu). */
// eslint-disable-next-line react-refresh/only-export-components
export const getStatusChipMeta = (status: StatusChipStatus) => STATUS_CHIP_CONFIG[status];

export const StatusChip = ({ status, label, icon, className, children }: StatusChipProps) => {
  const config = STATUS_CHIP_CONFIG[status];
  const Icon = icon === false ? false : icon ?? config.icon;

  return (
    <IconChip icon={Icon} tone={config.tone} label={label ?? config.label} className={className}>
      {children}
    </IconChip>
  );
};
