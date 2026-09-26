import { memo } from 'react';
import { CalendarDays, User } from 'lucide-react';
import type { Ticket } from '../../api/ticket';
import { getChecklistProgress } from '../../lib/checklistProgress';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { useAuth } from '../../context/AuthContext';
import { PRIORITY_CONFIG, ticketCode } from './ticketDisplay';
import { StatusChip, getStatusChipLabel, type StatusChipStatus } from '../../components/statusChip';
import { PriorityChip } from '../../components/priorityChip';
import { DepartmentChip } from '../../components/departmentChip';
import { IconChip } from '../../components/iconChip';
import { TagChip } from '../../components/tagChip';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface TicketCardProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
  departmentName?: string;
  index?: number;
}

// "Today" / "Tomorrow" / "Yesterday", otherwise "19 Sept". Same wording the delegation cards use.
const dueLabel = (iso: string) => {
  const startOfDay = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * One ticket as a tile, in the same design as the delegation list cards: title, a quiet meta line
 * (ticket code, checklist count), then one row of icon chips for status, priority, department and
 * due date, with the assignee's avatar at the end. Also the board's kanban card, so it has to read
 * well narrow too: the chip row wraps, the title is capped at two lines.
 */
const TicketCardComponent = ({ ticket, onClick, departmentName, index = 0 }: TicketCardProps) => {
  const { user } = useAuth();
  const { totalItems, doneItems, progress } = getChecklistProgress(ticket.checklists);

  const isOverdue = ticket.isOverdue && ticket.status !== 'CLOSED';
  const priorityInfo = PRIORITY_CONFIG[ticket.priority];
  const statusChipStatus = ticket.status.toLowerCase() as StatusChipStatus;
  const statusLabel = getTicketStatusLabel(ticket.status, user?.role, getStatusChipLabel(statusChipStatus));
  const assigneeName = ticket.assignee ? ticket.assignee.firstName : null;
  // statusUpdates is newest-first, so the first ON_HOLD entry is the reason it is on hold now.
  const onHoldRemark = ticket.status === 'ON_HOLD'
    ? (ticket.statusUpdates ?? []).find(su => su.toStatus === 'ON_HOLD')?.remark ?? null
    : null;

  const statusChip = <StatusChip status={statusChipStatus} label={statusLabel} />;

  return (
    <button
      type="button"
      onClick={() => onClick(ticket)}
      className="group w-full h-full text-left flex flex-col gap-2.5 p-3.5 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50 active:bg-surface-hover/50 transition-all duration-200 ease-in-out cursor-pointer animate-step-in outline-none focus-visible:border-primary-500/50 focus-visible:ring-2 focus-visible:ring-primary-500/30 [-webkit-tap-highlight-color:transparent]"
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      <div className="flex flex-col gap-1 min-w-0 w-full">
        <div className="flex items-start gap-2 min-w-0">
          <h3 className="flex-1 min-w-0 text-[15px] font-display font-semibold text-text tracking-tight leading-snug line-clamp-2">
            {ticket.title}
          </h3>
          {assigneeName ? (
            <span
              className={`flex items-center justify-center size-6 rounded-full text-white text-[10px] font-bold shrink-0 ${avatarColorClass(assigneeName)}`}
              title={`Assigned to ${assigneeName}`}
            >
              {getInitials(assigneeName)}
            </span>
          ) : (
            <span className="flex items-center justify-center size-6 rounded-full bg-surface-hover text-text-light shrink-0" title="Unassigned">
              <User size={12} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
          <span className="font-mono tracking-tight">{ticketCode(ticket.id)}</span>
          {progress !== null && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">Checklist {doneItems}/{totalItems}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-auto w-full">
        {onHoldRemark ? (
          // StatusChip doesn't forward props, so it can't be the asChild target itself.
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help">{statusChip}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-left whitespace-normal">
              {onHoldRemark}
            </TooltipContent>
          </Tooltip>
        ) : statusChip}

        <PriorityChip meta={priorityInfo} />

        {departmentName && <DepartmentChip name={departmentName} className="shrink-0" />}

        {ticket.tatDueAt && (
          <IconChip
            icon={CalendarDays}
            tone={isOverdue ? 'bg-danger' : 'bg-primary-700'}
            label={dueLabel(ticket.tatDueAt)}
            title={isOverdue ? 'Overdue' : 'Target resolution date'}
            className={isOverdue ? 'border-danger/30 text-danger' : undefined}
          />
        )}

        {/* Capped at two with a +n: a ticket can carry up to 12 labels. */}
        {ticket.tags.slice(0, 2).map((tag) => <TagChip key={tag.id} tag={tag} />)}
        {ticket.tags.length > 2 && (
          <span
            className="text-[10px] font-semibold text-text-muted tabular-nums"
            title={ticket.tags.map((t) => t.name).join(', ')}
          >
            +{ticket.tags.length - 2}
          </span>
        )}

        {progress !== null && (
          <span className="flex items-center gap-1.5 ml-auto shrink-0">
            <span className="w-12 h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <span
                className="block h-full rounded-full bg-primary-600 transition-all duration-300 ease-in-out"
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className="text-[10px] font-semibold text-text-muted tabular-nums">{progress}%</span>
          </span>
        )}
      </div>
    </button>
  );
};

export const TicketCard = memo(TicketCardComponent);
