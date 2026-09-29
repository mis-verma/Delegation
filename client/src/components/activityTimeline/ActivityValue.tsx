import { StatusChip, type StatusChipStatus } from '../statusChip/StatusChip';
import { PriorityChip } from '../priorityChip/PriorityChip';
import { PRIORITY_MAP, STATUS_LABEL } from '../../features/tasks/taskDisplay';
import { PRIORITY_CONFIG } from '../../features/tickets/ticketDisplay';
import type { AuditEntityType } from '../../api/auditLogs';

const EMPTY = '—';

// Delegation's own statuses onto the shared chip palette — same mapping TaskDetail's header chip
// uses, so a status reads identically in the header and in its own history.
const TASK_STATUS_CHIP: Record<string, StatusChipStatus> = {
  draft: 'open',
  todo: 'open',
  in_progress: 'in_progress',
  pending_approval: 'pending_approval',
  done: 'completed',
};

const TICKET_STATUS_CHIP: Record<string, StatusChipStatus> = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  PENDING_APPROVAL: 'pending_approval',
  CLOSED: 'closed',
  ON_HOLD: 'on_hold',
};

/**
 * One side of a change. Status and priority render as the exact chips the card and header show,
 * so "On Hold → In Progress" here looks like the thing it changed, not a generic text box. Every
 * other field falls back to a plain value pill.
 */
export const ActivityValue = ({
  entityType,
  field,
  raw,
  text,
  side,
}: {
  entityType: AuditEntityType;
  field: string;
  raw: unknown;
  text: string;
  side: 'before' | 'after';
}) => {
  // The old value is the one you're reading past, so it steps back rather than getting struck
  // through (a line-through on 11px text was the hardest thing in the old row to read).
  const dim = side === 'before' ? 'opacity-60' : '';

  if (typeof raw === 'string' && field === 'status') {
    if (entityType === 'Ticket' && TICKET_STATUS_CHIP[raw]) {
      return <StatusChip status={TICKET_STATUS_CHIP[raw]} className={dim} />;
    }
    if (entityType === 'Task' && TASK_STATUS_CHIP[raw]) {
      return (
        <StatusChip
          status={TASK_STATUS_CHIP[raw]}
          label={STATUS_LABEL[raw as keyof typeof STATUS_LABEL]}
          className={dim}
        />
      );
    }
  }

  if (typeof raw === 'string' && field === 'priority') {
    const meta =
      entityType === 'Ticket'
        ? PRIORITY_CONFIG[raw as keyof typeof PRIORITY_CONFIG]
        : entityType === 'Task'
          ? PRIORITY_MAP[raw as keyof typeof PRIORITY_MAP]
          : undefined;
    if (meta) return <PriorityChip meta={meta} className={dim} />;
  }

  if (text === EMPTY) {
    return <span className="text-[11px] font-display font-medium text-text-light italic">Empty</span>;
  }

  return (
    <span
      title={text}
      className={`inline-flex items-center min-w-0 max-w-[16rem] px-2.5 py-1 rounded-full border text-[11px] font-display font-semibold truncate ${
        side === 'before'
          ? 'border-border/60 bg-surface-hover/60 text-text-muted'
          : 'border-primary-500/25 bg-primary-500/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
      }`}
    >
      <span className="truncate">{text}</span>
    </span>
  );
};
