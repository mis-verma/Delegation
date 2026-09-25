import { Tag, Sparkles, UserCheck, Clock, User, ChevronDown, Lock } from 'lucide-react';
import { Dropdown, StatusChip, PriorityChip, type DropdownAction, type StatusChipStatus } from '../../../components';
import { getTicketStatusLabel } from '../../../lib/ticketStatusLabel';
import { TicketAttributeCard } from './TicketAttributeCard';
import { PRIORITY_CONFIG } from '../ticketDisplay';
import { STATUS_OPTIONS } from './detailConstants';
import type { Ticket } from '../../../api/ticket';
import type { Role } from '../../../api/auth';

interface TicketQuickAttributesProps {
  ticket: Ticket;
  currentUserRole: Role | undefined;
  canAssign: boolean;
  assigneeActions: DropdownAction[];
  isOverdue: boolean;
}

export const TicketQuickAttributes = ({
  ticket,
  currentUserRole,
  canAssign,
  assigneeActions,
  isOverdue,
}: TicketQuickAttributesProps) => {
  const statusChipStatus = ticket.status.toLowerCase() as StatusChipStatus;
  const priorityInfo = PRIORITY_CONFIG[ticket.priority];
  const statusLabel = getTicketStatusLabel(
    ticket.status,
    currentUserRole,
    STATUS_OPTIONS.find(s => s.value === ticket.status)?.label ?? ticket.status,
  );

  return (
    // Two-up at every size, not just `sm:` — Status/Priority/Assignee/SLA are each a short label
    // plus a compact chip, and stacking all four one-per-row on a phone meant scrolling past this
    // whole block before reaching the description. Halving it to a 2x2 grid fits comfortably even
    // at 375px, same as the attribute cards' own compact padding already assumes.
    <div className="grid grid-cols-2 gap-1 font-sans">

      <TicketAttributeCard icon={Tag} label="Status">
        <StatusChip status={statusChipStatus} label={statusLabel}>
          <Lock size={12} className="opacity-60" strokeWidth={2.5} />
        </StatusChip>
      </TicketAttributeCard>

      <TicketAttributeCard icon={Sparkles} label="Priority">
        <PriorityChip meta={priorityInfo} />
      </TicketAttributeCard>

      <TicketAttributeCard icon={UserCheck} label="Assignee">
        {canAssign ? (
          <Dropdown
            align="start"
            items={assigneeActions}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-2.5 text-xs font-bold px-2.5 py-1.5 rounded-xl bg-surface-hover text-text hover:bg-surface-active transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-95 w-fit"
              >
                {ticket.assignee ? (
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary-600 text-white text-[9px] font-black shrink-0 shadow-sm ring-1 ring-primary-700/50">
                    {ticket.assignee.firstName.slice(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <div className="flex items-center justify-center h-5 w-5 rounded-full bg-surface-active shrink-0 ring-1 ring-border-hover">
                    <User size={12} className="text-text-secondary" strokeWidth={2.5} />
                  </div>
                )}
                <span>{ticket.assignee ? ticket.assignee.firstName : 'Unassigned'}</span>
                <ChevronDown size={14} className="text-text-light" strokeWidth={2.5} />
              </button>
            }
          />
        ) : (
          <span className="text-sm text-text-secondary flex items-center gap-2.5 py-1 font-semibold">
            {ticket.assignee ? (
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary-600 text-white text-[10px] font-black shrink-0 shadow-sm ring-1 ring-primary-700/50">
                {ticket.assignee.firstName.slice(0, 2).toUpperCase()}
              </span>
            ) : (
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-surface-hover shrink-0 ring-1 ring-border">
                <User size={14} className="text-text-muted" strokeWidth={2.5} />
              </div>
            )}
            {ticket.assignee ? ticket.assignee.firstName : 'Unassigned'}
          </span>
        )}
      </TicketAttributeCard>

      <TicketAttributeCard icon={Clock} label="SLA Deadline">
        {ticket.tatDueAt ? (
          <div className="flex items-center gap-2.5 py-1">
            <span className={`text-sm font-bold tracking-tight ${isOverdue ? 'text-danger' : 'text-text-secondary'}`}>
              {new Date(ticket.tatDueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {isOverdue && <StatusChip status="overdue" />}
          </div>
        ) : (
          <span className="text-sm font-medium text-text-light py-1 italic">No SLA set</span>
        )}
      </TicketAttributeCard>

    </div>
  );
};