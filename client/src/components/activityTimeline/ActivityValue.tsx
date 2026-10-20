import { StatusChip, type StatusChipStatus } from '../statusChip/StatusChip';
import { PriorityChip } from '../priorityChip/PriorityChip';
import { PRIORITY_MAP, STATUS_LABEL } from '../../features/tasks/taskDisplay';
import { PRIORITY_CONFIG } from '../../features/tickets/ticketDisplay';
import { labelChipClass } from '../../lib/labelColors';
import type { AuditEntityType } from '../../api/auditLogs';

const EMPTY = '—';

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

  if (field === 'tagIds' && Array.isArray(raw) && text !== EMPTY) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1 ${dim}`}>
        {text.split(', ').map((name) => (
          <span key={name} className={`inline-flex items-center h-6 px-2 rounded-full border t-meta font-display font-semibold ${name.startsWith('+') || name.startsWith('#') ? 'border-border/60 bg-surface-hover/60 text-text-muted' : labelChipClass(name)}`}>
            {name}
          </span>
        ))}
      </span>
    );
  }

  if (text === EMPTY) {
    return <span className="t-meta font-display font-medium text-text-light italic">Empty</span>;
  }

  return (
    <span
      title={text}
      className={`inline-flex items-center min-w-0 max-w-[16rem] px-2.5 py-1 rounded-full border t-meta font-display font-semibold truncate ${
        side === 'before'
          ? 'border-border/60 bg-surface-hover/60 text-text-muted'
          : 'border-primary-500/25 bg-primary-500/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
      }`}
    >
      <span className="truncate">{text}</span>
    </span>
  );
};
