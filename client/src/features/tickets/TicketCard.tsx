import { memo } from 'react';
import { CalendarDays, User } from 'lucide-react';
import type { Ticket } from '../../api/ticket';
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
  /** Board columns are narrow, so there the department stays plain text and labels wait for `xl`. */
  variant?: 'list' | 'board';
  /** Hide the avatar when the list is already grouped by that person. */
  hideAssignee?: boolean;
}

/**
 * One ticket as a tile, in the same design as the delegation list cards: title, a quiet one-line
 * meta line (ticket code, checklist count, department on phones), then a row of icon chips. Phones
 * show only status, priority and due so every card is the same height; department and labels join
 * from `sm`. Also the board's kanban card, so it has to read well narrow too.
 */
const TicketCardComponent = ({ ticket, onClick, departmentName, variant = 'list', hideAssignee = false }: TicketCardProps) => {
  const { totalItems, doneItems, progress } = getChecklistProgress(ticket.checklists);

  const due = formatDueLabel(ticket);
  const isOverdue = !!due?.overdue;
  const isBoard = variant === 'board';
  // Phones: department is plain meta text. From sm it is a chip, except in narrow board columns,
  // where it stays text and labels wait for xl.
  const deptChipClass = isBoard ? 'hidden' : 'hidden sm:inline-flex';
  const tagChipClass = isBoard ? 'hidden xl:inline-flex' : 'hidden sm:inline-flex';
  const priorityInfo = PRIORITY_CONFIG[ticket.priority];
  const statusChipStatus = ticket.status.toLowerCase() as StatusChipStatus;
  const statusLabel = getTicketStatusLabel(ticket.status);
  const assigneeName = ticket.assignee ? ticket.assignee.firstName : null;
  // statusUpdates is newest-first, so the first ON_HOLD entry is the reason it is on hold now.
  const onHoldRemark = ticket.status === 'ON_HOLD'
    ? (ticket.statusUpdates ?? []).find(su => su.toStatus === 'ON_HOLD')?.remark ?? null
    : null;

  const prefetchHandlers = usePrefetchTicket(ticket.id);

  const statusChip = <StatusChip status={statusChipStatus} label={statusLabel} />;

  return (
    <button
      type="button"
      onClick={() => onClick(ticket)}
      {...prefetchHandlers}
      className="group w-full h-full text-left flex flex-col gap-2 sm:gap-2.5 p-3 sm:p-3.5 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50 active:bg-surface-hover/50 transition-all duration-200 ease-in-out cursor-pointer select-none outline-none focus-visible:border-primary-500/50 focus-visible:ring-2 focus-visible:ring-primary-500/30 [-webkit-tap-highlight-color:transparent]"
    >
      <div className="flex flex-col gap-1 min-w-0 w-full">
        <div className="flex items-start gap-2 min-w-0">
          {/* leading-5 matches the old phone avatar height so the first line and the avatar centre-align. */}
          <h3 className="flex-1 min-w-0 t-card font-display font-semibold text-text tracking-tight leading-5 sm:leading-6 line-clamp-2 break-words">
            {ticket.title}
          </h3>
          {!hideAssignee && (assigneeName ? (
            <span
              className={`flex items-center justify-center size-6 sm:size-7 rounded-full text-white text-xs font-bold shrink-0 ${avatarColorClass(assigneeName)}`}
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
        {/* What the ticket is about: two lines at most, and not on a phone, where the title has to
            carry the card and every card stays the same short height. */}
        {ticket.description?.trim() && (
          <p className="max-sm:hidden text-sm text-text-secondary leading-snug line-clamp-2 break-words">{ticket.description.trim()}</p>
        )}
        {/* The reason is also in the status chip's tooltip, but a phone has no hover. */}
        {onHoldRemark && (
          <p className="t-meta text-text-muted leading-snug line-clamp-1 break-words">
            <span className="font-semibold text-text-secondary">On hold:</span> {onHoldRemark}
          </p>
        )}
        {/* One line, never wraps: the department is the only part that truncates. Parts are joined
            with commas. Only drawn when there is something to say. */}
        {((isOverdue && !due) || progress !== null || (departmentName && !isBoard)) && (
          <div className="flex items-center min-w-0 whitespace-nowrap t-meta leading-4 font-medium text-text-muted">
            {/* "Late" in words only where there is no red due chip saying it already. */}
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

      <div className="flex items-center gap-x-1.5 gap-y-1.5 flex-wrap mt-auto w-full">
        {onHoldRemark ? (
          // StatusChip doesn't forward props, so it can't be the asChild target itself.
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex max-w-full min-w-0 cursor-help">{statusChip}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-left whitespace-normal">
              {onHoldRemark}
            </TooltipContent>
          </Tooltip>
        ) : statusChip}

        {/* Every priority shows, as in To-Do and Delegation, so the chip reads the same across the three. */}
        <PriorityChip meta={priorityInfo} />

        {departmentName && <DepartmentChip name={departmentName} className={deptChipClass} />}

        {due && (
          <IconChip
            icon={CalendarDays}
            tone={isOverdue ? 'bg-danger' : 'bg-text-muted'}
            label={due.text}
            className={isOverdue ? 'border-danger/30' : undefined}
            labelClassName={isOverdue ? 'text-danger' : undefined}
          />
        )}

        {/* Capped at two with a +n: a ticket can carry up to 12 labels. Hidden on phones. */}
        {ticket.tags.slice(0, 2).map((tag) => <TagChip key={tag.id} tag={tag} className={tagChipClass} />)}
        {ticket.tags.length > 2 && (
          <span
            className={`${isBoard ? 'hidden xl:inline' : 'hidden sm:inline'} t-meta font-semibold text-text-muted tabular-nums`}
            title={ticket.tags.map((t) => t.name).join(', ')}
          >
            +{ticket.tags.length - 2}
          </span>
        )}

        {/* The bar is desktop-only: on a phone the meta line already says "Checklist 3/10". */}
        {progress !== null && (
          <span className="hidden sm:flex items-center gap-1.5 ml-auto shrink-0">
            <span className="w-12 h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <span
                className="block h-full rounded-full bg-text-muted transition-all duration-300 ease-in-out"
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className="t-meta font-semibold text-text-muted tabular-nums">{progress}%</span>
          </span>
        )}

        <span
          className={`${progress !== null ? 'hidden sm:inline' : ''} ${progress === null ? 'ml-auto' : ''} shrink-0 t-meta font-medium text-text-light tabular-nums`}
          title={`Raised ${new Date(ticket.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`}
        >
          {formatAge(ticket.createdAt)}
        </span>
      </div>
    </button>
  );
};

export const TicketCard = memo(TicketCardComponent);
