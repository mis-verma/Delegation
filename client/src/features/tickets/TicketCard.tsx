import { memo } from 'react';
import { AlarmClock, CalendarDays, Clock3, Hand, User } from 'lucide-react';
import type { Ticket } from '../../api/ticket';
import { latestRemarkOf } from '../../lib/ticketProgress';
import { TicketFlowChips } from './TicketFlowChips';
import { getChecklistProgress } from '../../lib/checklistProgress';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { cn } from '@/lib/utils';
import { usePrefetchTicket } from './hook';
import { isAwaitingAssigneeClaim, isClaimable, tatText } from './claim/ticketClaim';
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
  const claimable = isClaimable(ticket);
  const awaitingAssignee = isAwaitingAssigneeClaim(ticket);
  const statusChipStatus = (ticket.declinedAt ? 'declined' : ticket.status.toLowerCase()) as StatusChipStatus;
  const statusLabel = ticket.declinedAt ? 'Declined' : getTicketStatusLabel(ticket.status);
  const assigneeName = ticket.assignee ? ticket.assignee.firstName : null;
  const onHoldRemark = ticket.status === 'ON_HOLD'
    ? (ticket.statusUpdates ?? []).find((su) => su.toStatus === 'ON_HOLD')?.remark ?? null
    : null;
  const prefetchHandlers = usePrefetchTicket(ticket.id);
  const latestRemark = latestRemarkOf(ticket);
  const category = ticket.category?.name
    ? ticket.subcategory?.name ? `${ticket.category.name} / ${ticket.subcategory.name}` : ticket.category.name
    : null;

  const statusChip = <StatusChip status={statusChipStatus} label={statusLabel} />;

  return (
    <button
      type="button"
      onClick={() => onClick(ticket)}
      {...prefetchHandlers}
      className={cn(
        'group relative flex h-full w-full cursor-pointer select-none flex-col gap-3 overflow-hidden rounded-2xl border bg-surface p-4 text-left outline-none transition-[border-color,background-color,transform] duration-200 ease-out active:scale-[0.99] focus-visible:ring-2 [-webkit-tap-highlight-color:transparent]',
        isOverdue
          ? 'border-danger/35 hover:border-danger/60 focus-visible:ring-danger/30 before:absolute before:inset-y-4 before:left-0 before:w-1 before:rounded-r-full before:bg-danger'
          : 'border-border/60 hover:border-primary-500/40 hover:bg-surface-hover/25 focus-visible:ring-primary-500/30 dark:border-white/[0.07]',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {onHoldRemark ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex min-w-0 max-w-full cursor-help">{statusChip}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] whitespace-normal text-left">{onHoldRemark}</TooltipContent>
            </Tooltip>
          ) : statusChip}
          <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />
          <TicketFlowChips ticket={ticket} />
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 t-meta font-medium tabular-nums text-text-light"
          title={`Sent ${new Date(ticket.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`}
        >
          <Clock3 className="size-3" aria-hidden="true" />
          {formatAge(ticket.createdAt)}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="t-card font-display font-semibold leading-snug text-text line-clamp-2 break-words">{ticket.title}</h3>
        {category && <p className="t-meta font-medium text-text-muted line-clamp-1 break-words">{category}</p>}
        {ticket.description?.trim() && !isBoard && (
          <p className="max-sm:hidden text-sm leading-snug text-text-secondary line-clamp-2 break-words">{ticket.description.trim()}</p>
        )}
      </div>

      {ticket.declinedAt && ticket.declineReason ? (
        <p className="border-l-2 border-danger/60 pl-2.5 t-meta leading-snug text-danger line-clamp-2 break-words">
          <span className="font-semibold">Declined{ticket.decliner ? ` by ${ticket.decliner.firstName}` : ''}: </span>{ticket.declineReason}
        </p>
      ) : latestRemark ? (
        <div className="flex min-w-0 flex-col gap-0.5 border-l-2 border-primary-500/40 pl-2.5">
          <span className="flex min-w-0 items-center gap-1.5 t-meta text-text-muted">
            <span className="shrink-0 font-display font-semibold text-text-secondary">{latestRemark.label}</span>
            <span className="min-w-0 truncate">{latestRemark.by}</span>
            <span className="shrink-0 tabular-nums">· {latestRemark.ago}</span>
          </span>
          <p className="t-meta leading-snug text-text-secondary line-clamp-2 break-words">{latestRemark.text}</p>
        </div>
      ) : null}

      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-1.5 border-t border-border/50 pt-3 dark:border-white/[0.06]">
        {!hideAssignee && (
          <span className="inline-flex min-w-0 items-center gap-1.5 pr-1" title={assigneeName ? `Assigned to ${assigneeName}` : claimable ? 'Nobody yet, open to claim' : 'Nobody yet'}>
            {assigneeName ? (
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full t-meta font-bold text-white ring-2 ring-surface', avatarColorClass(assigneeName))} aria-hidden="true">
                {getInitials(assigneeName)}
              </span>
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-light" aria-hidden="true">
                <User className="size-3" />
              </span>
            )}
            <span className={cn('min-w-0 truncate t-meta font-display font-semibold', assigneeName ? 'text-text-secondary' : 'text-text-muted')}>
              {assigneeName ?? (claimable ? 'Open to claim' : 'Nobody yet')}
            </span>
          </span>
        )}

        {claimable && (
          <IconChip icon={Hand} tone="bg-primary-600" label={tatText(ticket.tatHours) ? `To claim, ${tatText(ticket.tatHours)}` : 'To claim'} title="Anyone in this department can claim it. The clock starts at claim." />
        )}
        {awaitingAssignee && (
          <IconChip icon={Hand} tone="bg-warning" label={`${assigneeName ?? 'Assignee'} to claim`} labelClassName="text-warning" title="Given by the department head. Their clock starts when they claim it." />
        )}

        {due && (
          <IconChip
            icon={isOverdue ? AlarmClock : CalendarDays}
            tone={isOverdue ? 'bg-danger' : due.today ? 'bg-warning' : 'bg-text-muted'}
            label={due.text}
            labelClassName={isOverdue ? 'text-danger' : due.today ? 'text-warning' : undefined}
          />
        )}

        {departmentName && <DepartmentChip name={departmentName} className={isBoard ? 'hidden max-w-[8rem] sm:inline-flex' : 'max-w-[10rem]'} />}

        {ticket.tags.slice(0, 2).map((tag) => <TagChip key={tag.id} tag={tag} className={isBoard ? 'hidden xl:inline-flex' : 'hidden sm:inline-flex'} />)}
        {ticket.tags.length > 2 && (
          <span className={cn(isBoard ? 'hidden xl:inline' : 'hidden sm:inline', 't-meta font-semibold tabular-nums text-text-muted')} title={ticket.tags.map((t) => t.name).join(', ')}>
            +{ticket.tags.length - 2}
          </span>
        )}

        {progress !== null && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5" title={`Checklist ${doneItems} of ${totalItems}`}>
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-hover">
              <span className={cn('block h-full rounded-full transition-[width] duration-300 ease-out', progress === 100 ? 'bg-success' : 'bg-primary-600')} style={{ width: `${progress}%` }} />
            </span>
            <span className={cn('t-meta font-semibold tabular-nums', progress === 100 ? 'text-success' : 'text-text-secondary')}>{progress}%</span>
          </span>
        )}
      </div>
    </button>
  );
};

export const TicketCard = memo(TicketCardComponent);
