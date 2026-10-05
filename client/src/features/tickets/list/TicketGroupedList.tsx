import { memo, useMemo } from 'react';
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
  const groupOffsets = useMemo(() => (
    groups.reduce<{ offsets: number[]; count: number }>((acc, group) => {
      acc.offsets.push(acc.count);
      acc.count += group.tickets.length;
      return acc;
    }, { offsets: [], count: 0 }).offsets
  ), [groups]);

  return (
    <div className="flex flex-col gap-5 sm:gap-8">
      {groups.map((group, groupIdx) => {
        const stats = groupChecklistStats(group.tickets);
        const groupOffset = groupOffsets[groupIdx];

        return (
          <div key={group.key} className="flex flex-col gap-3 sm:gap-4">
            <TicketGroupHeader
              label={group.label}
              groupBy={groupBy}
              ticketCount={group.tickets.length}
              stats={stats}
            />

            <div className={TICKET_GRID_CLASS}>
              {group.tickets.map((ticket, ticketIdx) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={onSelectTicket}
                  index={groupOffset + ticketIdx}
                  departmentName={
                    departmentNames.get(ticket.departmentId ?? '') ?? 'Ticket'
                  }
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