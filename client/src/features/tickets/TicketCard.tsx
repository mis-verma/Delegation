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
import { Badge } from '@/components/ui/badge';

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

      {/* Was one big flex-wrap row holding the chips *and* the w-full progress bar *and* the due
          pill — a full-width item inside a wrapping chip row forces a line break before itself
          and strands whatever comes after it alone on the next line too, so the due pill ended up
          orphaned on its own row for no reason tied to its own size. Three explicit rows (chips,
          then the bar — which is meant to be full-width — then due date + assignee together)
          instead of one container relying on wrap behavior to land in the right place. */}
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {onHoldRemark ? (
            // StatusChip has a fixed prop signature (doesn't spread/forward arbitrary props), so
            // it can't be the direct child of an `asChild` Tooltip trigger — Radix's cloned
            // hover/focus handlers would just be dropped. A plain <span> wrapper gives Radix a
            // real DOM element to attach them to instead.
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help">
                  <StatusChip status={statusChipStatus} label={statusLabel} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-left whitespace-normal">
                {onHoldRemark}
              </TooltipContent>
            </Tooltip>
          ) : (
            // Was `icon={false}` — the only thing that actually carries a status's colour on this
            // chip (see IconChip) — so every status rendered as the same flat, colourless pill
            // regardless of what it was, right beside Priority/Department chips that were already
            // in full colour.
            <StatusChip status={statusChipStatus} label={statusLabel} />
          )}

          <PriorityChip meta={priorityInfo} />

          <DepartmentChip name={departmentName ?? 'Ticket'} className="shrink-0 max-w-[140px]" />
        </div>

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

        <div className="flex items-center justify-between gap-2">
          {ticket.tatDueAt ? (
            <Badge
              variant={isOverdue ? 'destructive' : 'secondary'}
              title={isOverdue ? "This ticket is past its target resolution time" : "Target resolution date"}
              className={isOverdue ? 'bg-danger/10' : 'bg-surface'}
            >
              {isOverdue ? (
                <AlertCircle size={12} strokeWidth={2.5} className="shrink-0 animate-pulse" />
              ) : (
                <Clock size={12} strokeWidth={2} className="shrink-0 opacity-70" />
              )}
              {isOverdue && 'Overdue · '}
              {new Date(ticket.tatDueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Badge>
          ) : <span />}

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
      </div>
    </button>
  );
};

export const TicketCard = memo(TicketCardComponent);
