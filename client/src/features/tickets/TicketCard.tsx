import { memo } from 'react';
import { Clock, AlertCircle, User } from 'lucide-react';
import type { Ticket } from '../../api/ticket';
import { getChecklistProgress } from '../../lib/checklistProgress';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { useAuth } from '../../context/AuthContext';
import { PRIORITY_CONFIG } from './ticketDisplay';
import { ChecklistProgressBar, DueProgressBar } from '../../components/progress';
import { StatusChip, getStatusChipLabel, type StatusChipStatus } from '../../components/statusChip';
import { PriorityChip } from '../../components/priorityChip';
import { DepartmentChip } from '../../components/departmentChip';
import { TagChip } from '../../components/tagChip';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface TicketCardProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
  departmentName?: string;
  index?: number;
}

const TicketCardComponent = ({ ticket, onClick, departmentName, index = 0 }: TicketCardProps) => {
  const { user } = useAuth();
  const { totalItems, doneItems, progress } = getChecklistProgress(ticket.checklists);

  const isOverdue = ticket.isOverdue && ticket.status !== 'CLOSED';
  const priorityInfo = PRIORITY_CONFIG[ticket.priority];
  const statusChipStatus = ticket.status.toLowerCase() as StatusChipStatus;
  const statusLabel = getTicketStatusLabel(ticket.status, user?.role, getStatusChipLabel(statusChipStatus));
  const assigneeName = ticket.assignee ? ticket.assignee.firstName : null;
  // statusUpdates is newest-first (see TicketStatusHistory's own `index === 0` convention) — the
  // first ON_HOLD entry found is therefore the most recent one, i.e. the reason this ticket is
  // *currently* on hold, not some earlier hold-and-resume cycle.
  const onHoldRemark = ticket.status === 'ON_HOLD'
    ? (ticket.statusUpdates ?? []).find(su => su.toStatus === 'ON_HOLD')?.remark ?? null
    : null;

  return (
    <button
      type="button"
      onClick={() => onClick(ticket)}
      className="group relative w-full text-left flex flex-col gap-2.5 p-4 rounded-lg border border-border bg-surface hover:border-primary-500/40 transition-colors duration-200 cursor-pointer animate-step-in outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 overflow-hidden"
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >

      <div className="flex flex-col justify-between gap-1">
        <h3 className="w-full min-w-0 text-sm font-bold text-text-secondary truncate leading-tight">
          {ticket.title}
        </h3>
        {ticket.description && (
          <p className="w-full min-w-0 text-xs text-text-secondary leading-tight line-clamp-1">
            {ticket.description}
          </p>
        )}
      </div>

      {/* Capped at 3 + a "+N" overflow rather than wrapping freely like the badge row below —
          a ticket can carry up to 12 labels, and this card is reused by the board's kanban
          columns too (narrow, dense), where an uncapped label list would dominate the card. */}
      {ticket.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {ticket.tags.slice(0, 3).map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
          {ticket.tags.length > 3 && (
            <span className="text-[10px] font-medium text-text-light px-1">+{ticket.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {onHoldRemark ? (
            // StatusChip has a fixed prop signature (doesn't spread/forward arbitrary props), so
            // it can't be the direct child of an `asChild` Tooltip trigger — Radix's cloned
            // hover/focus handlers would just be dropped. A plain <span> wrapper gives Radix a
            // real DOM element to attach them to instead.
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help">
                  <StatusChip status={statusChipStatus} label={statusLabel} icon={false} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-left whitespace-normal">
                {onHoldRemark}
              </TooltipContent>
            </Tooltip>
          ) : (
            <StatusChip status={statusChipStatus} label={statusLabel} icon={false} />
          )}


          <PriorityChip meta={priorityInfo} />

          <DepartmentChip name={departmentName ?? 'Ticket'} className="inline-flex items-center shrink-0 max-w-[140px] truncate text-[10px] font-medium px-1.5 py-0.5 rounded" />

          {progress !== null ? (
            <ChecklistProgressBar done={doneItems} total={totalItems} />
          ) : (
            // `!isOverdue`: past the deadline DueProgressBar renders its own red "Overdue" pill,
            // which sat immediately beside the red due pill below — two alert pills, same icon,
            // same colour, one of them carrying no information the other didn't. The bar is for
            // time *remaining*; once there is none, the pill below says so on its own.
            ticket.tatDueAt && ticket.status !== 'CLOSED' && !isOverdue && (
              <DueProgressBar createdAt={ticket.createdAt} dueDate={ticket.tatDueAt} overdue={false} />
            )
          )}

          {ticket.tatDueAt && (
            <span
              title={isOverdue ? "This ticket is past its target resolution time" : "Target resolution date"}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all duration-300 border ${isOverdue
                  ? 'bg-danger/10 text-danger border-danger/20'
                  : 'bg-surface border-border/50 text-text-secondary hover:text-text hover:bg-surface-hover'
                }`}
            >
              {isOverdue ? (
                <AlertCircle size={12} strokeWidth={2.5} className="shrink-0 animate-pulse" />
              ) : (
                <Clock size={12} strokeWidth={2} className="shrink-0 opacity-70" />
              )}
              {isOverdue && 'Overdue · '}
              {new Date(ticket.tatDueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}


        </div>

        {assigneeName ? (
          <div
            className={`flex items-center justify-center size-6 rounded-full text-white text-[10px] font-bold shrink-0 ${avatarColorClass(assigneeName)}`}
            title={`Assigned to ${assigneeName}`}
          >
            {getInitials(assigneeName)}
          </div>
        ) : (
          <div className="flex items-center justify-center size-6 rounded-full bg-surface-hover text-text-light shrink-0" title="Unassigned">
            <User size={12} />
          </div>
        )}



      </div>
    </button>
  );
};

export const TicketCard = memo(TicketCardComponent);
