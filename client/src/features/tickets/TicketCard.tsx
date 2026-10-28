import { memo } from 'react';
import { AlarmClock, CalendarDays, Clock3, User } from 'lucide-react';
import type { Ticket } from '../../api/ticket';
import { progressUpdatesOf } from '../../lib/ticketProgress';
import { TicketFlowChips } from './TicketFlowChips';
import { getChecklistProgress } from '../../lib/checklistProgress';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { usePrefetchTicket } from './hook';
import { PRIORITY_CONFIG, formatDueLabel, formatAge } from './ticketDisplay';
import { StatusChip, type StatusChipStatus } from '../../components/statusChip';
import { PriorityChip } from '../../components/priorityChip';
import { DepartmentChip } from '../../components/departmentChip';
import { IconChip } from '../../components/iconChip';
import { TagChip } from '../../components/tagChip';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface TicketCardProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
  departmentName?: string;
  variant?: 'list' | 'board';
  hideAssignee?: boolean;
}

const TicketCardComponent = ({ ticket, onClick, departmentName, variant = 'list', hideAssignee = false }: TicketCardProps) => {
  const { totalItems, doneItems, progress } = getChecklistProgress(ticket.checklists);

  const due = formatDueLabel(ticket);
  const isOverdue = !!due?.overdue;
  const isBoard = variant === 'board';
  const deptChipClass = isBoard ? 'hidden' : 'hidden sm:inline-flex';
  const tagChipClass = isBoard ? 'hidden xl:inline-flex' : 'hidden sm:inline-flex';
  const priorityInfo = PRIORITY_CONFIG[ticket.priority];
  const statusChipStatus = (ticket.declinedAt ? 'declined' : ticket.status.toLowerCase()) as StatusChipStatus;
  const statusLabel = ticket.declinedAt ? 'Declined' : getTicketStatusLabel(ticket.status);
  const assigneeName = ticket.assignee ? ticket.assignee.firstName : null;
  const onHoldRemark = ticket.status === 'ON_HOLD'
    ? (ticket.statusUpdates ?? []).find(su => su.toStatus === 'ON_HOLD')?.remark ?? null
    : null;

  const prefetchHandlers = usePrefetchTicket(ticket.id);
  const working = ticket.status === 'IN_PROGRESS' && !ticket.declinedAt && !ticket.awaitingHeadApproval;
  const latestNote = working ? progressUpdatesOf(ticket)[0]?.remark ?? null : null;

  const statusChip = <StatusChip status={statusChipStatus} label={statusLabel} />;

  return (
    <button
      type="button"
      onClick={() => onClick(ticket)}
      {...prefetchHandlers}
      className="group w-full h-full text-left flex flex-col gap-2 sm:gap-2 p-3 sm:p-3.5 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50 active:bg-surface-hover/50 transition-all duration-200 ease-in-out cursor-pointer select-none outline-none focus-visible:border-primary-500/50 focus-visible:ring-2 focus-visible:ring-primary-500/30 [-webkit-tap-highlight-color:transparent]"
    >
      <div className="flex flex-col gap-1 min-w-0 w-full">
        <div className="flex items-start gap-2 min-w-0">
          <h3 className="flex-1 min-w-0 t-card font-display font-semibold text-text leading-5 sm:leading-6 line-clamp-2 break-words">
            {ticket.title}
          </h3>
          {!hideAssignee && (assigneeName ? (
            <span
              className={`flex items-center justify-center size-6 sm:size-7 rounded-full text-white t-meta font-bold shrink-0 ring-1 ring-black/5 dark:ring-white/10 ${avatarColorClass(assigneeName)}`}
              title={`Assigned to ${assigneeName}`}
            >
              {getInitials(assigneeName)}
            </span>
          ) : (
            <span className="flex items-center justify-center size-6 sm:size-7 rounded-full bg-surface-hover text-text-light shrink-0" title="Unassigned">
              <User className="size-3" />
            </span>
          ))}
        </div>
        {ticket.description?.trim() && (
          <p className="max-sm:hidden text-sm text-text-secondary leading-snug line-clamp-2 break-words">{ticket.description.trim()}</p>
        )}
        {ticket.declinedAt && ticket.declineReason && (
          <p className="t-meta text-danger leading-snug line-clamp-1 break-words">
            <span className="font-semibold">Declined{ticket.decliner ? ` by ${ticket.decliner.firstName}` : ''}:</span> {ticket.declineReason}
          </p>
        )}
        {onHoldRemark && (
          <p className="t-meta text-text-muted leading-snug line-clamp-1 break-words">
            <span className="font-semibold text-text-secondary">On hold:</span> {onHoldRemark}
          </p>
        )}
        {latestNote && (
          <p className="t-meta text-text-muted leading-snug line-clamp-1 break-words">
            <span className="font-semibold text-text-secondary">Latest update:</span> {latestNote}
          </p>
        )}
        {((isOverdue && !due) || progress !== null || (departmentName && !isBoard)) && (
          <div className="flex items-center min-w-0 whitespace-nowrap t-meta leading-4 font-medium text-text-muted">
            {isOverdue && !due && <span className="font-semibold text-danger shrink-0">Late</span>}
            {progress !== null && (
              <span className="tabular-nums shrink-0">{isOverdue && !due ? ', ' : ''}Checklist {doneItems}/{totalItems}</span>
            )}
            {departmentName && !isBoard && (
              <span className="min-w-0 truncate sm:hidden">{(isOverdue && !due) || progress !== null ? ', ' : ''}{departmentName}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-x-1.5 gap-y-1.5 flex-wrap mt-auto w-full pt-2 sm:pt-2.5 border-t border-border/50 dark:border-white/[0.06]">
        {onHoldRemark ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex max-w-full min-w-0 cursor-help">{statusChip}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-left whitespace-normal">
              {onHoldRemark}
            </TooltipContent>
          </Tooltip>
        ) : statusChip}

        <TicketFlowChips ticket={ticket} />

        <PriorityChip meta={priorityInfo} />

        {departmentName && <DepartmentChip name={departmentName} className={deptChipClass} />}

        {due && (
          <IconChip
            icon={isOverdue ? AlarmClock : CalendarDays}
            tone={isOverdue ? 'bg-danger' : due.today ? 'bg-warning' : 'bg-text-muted'}
            label={due.text}
            className={isOverdue ? 'border-danger/30 bg-danger/10' : due.today ? 'border-warning/30 bg-warning/10' : undefined}
            labelClassName={isOverdue ? 'text-danger' : due.today ? 'text-warning' : undefined}
          />
        )}

        {ticket.tags.slice(0, 2).map((tag) => <TagChip key={tag.id} tag={tag} className={tagChipClass} />)}
        {ticket.tags.length > 2 && (
          <span
            className={`${isBoard ? 'hidden xl:inline' : 'hidden sm:inline'} t-meta font-semibold text-text-muted tabular-nums`}
            title={ticket.tags.map((t) => t.name).join(', ')}
          >
            +{ticket.tags.length - 2}
          </span>
        )}

        {progress !== null && (
          <span className="hidden sm:flex items-center gap-1.5 ml-auto shrink-0">
            <span className="w-12 h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <span
                className={`block h-full rounded-full transition-all duration-300 ease-in-out ${progress === 100 ? 'bg-success' : 'bg-linear-to-r from-primary-400 to-primary-600'}`}
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className={`t-meta font-semibold tabular-nums ${progress === 100 ? 'text-success' : 'text-text-secondary'}`}>{progress}%</span>
          </span>
        )}

        <span
          className={`hidden sm:inline-flex ${progress === null ? 'ml-auto' : ''} items-center gap-1 shrink-0 t-meta font-medium text-text-light tabular-nums`}
          title={`Raised ${new Date(ticket.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`}
        >
          <Clock3 className="size-3" strokeWidth={2.25} aria-hidden="true" />
          {formatAge(ticket.createdAt)}
        </span>
      </div>
    </button>
  );
};

export const TicketCard = memo(TicketCardComponent);
