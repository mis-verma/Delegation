import { memo } from 'react';
import { TicketCard } from '../TicketCard';
import { TicketGroupHeader } from './TicketGroupHeader';
import { groupChecklistStats } from './ticketGrouping';
import { TICKET_GRID_CLASS } from './ticketLayout';
import type { Ticket } from '../../../api/ticket';

interface TicketGroup {
  key: string;
  label: string;
  tickets: Ticket[];
}

interface TicketGroupedListProps {
  groups: TicketGroup[];
  groupBy: 'department' | 'assignee';
  onSelectTicket: (ticket: Ticket) => void;
  departmentNames: Map<string, string>;
}

const TicketGroupedListComponent = ({
  groups,
  groupBy,
  onSelectTicket,
  departmentNames,
}: TicketGroupedListProps) => {
  return (
    <div className="flex flex-col gap-5 sm:gap-8">
      {groups.map((group) => {
        const stats = groupChecklistStats(group.tickets);

        return (
          <div key={group.key} className="flex flex-col gap-3 sm:gap-4">
            <TicketGroupHeader
              label={group.label}
              groupBy={groupBy}
              ticketCount={group.tickets.length}
              stats={stats}
            />

            <div className={TICKET_GRID_CLASS}>
              {group.tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={onSelectTicket}
                  // The group header already names the department / the person, so the card
                  // doesn't repeat it. No department at all means no chip.
                  departmentName={
                    groupBy === 'department' ? undefined : departmentNames.get(ticket.departmentId ?? '')
                  }
                  hideAssignee={groupBy === 'assignee'}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const TicketGroupedList = memo(TicketGroupedListComponent);