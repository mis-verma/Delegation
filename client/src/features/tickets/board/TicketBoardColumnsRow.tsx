import { memo, useMemo } from 'react';
import type { Ticket } from '../../../api/ticket';
import { TicketBoardColumn } from './TicketBoardColumn';
import { TICKET_BOARD_COLUMNS } from './ticketBoardColumns';

export interface TicketBoardColumnsRowProps {
  tickets: Ticket[];
  draggable: boolean;
  onOpen: (ticket: Ticket) => void;
  departmentNames?: Map<string, string>;
}

export const TicketBoardColumnsRow = memo(({ tickets, draggable, onOpen, departmentNames }: TicketBoardColumnsRowProps) => {
  const byStatus = useMemo(() => {
    const map = new Map<Ticket['status'], Ticket[]>();
    for (const status of TICKET_BOARD_COLUMNS) map.set(status, []);
    for (const ticket of tickets) map.get(ticket.status)?.push(ticket);
    return map;
  }, [tickets]);

  return (
    <div className="grid grid-flow-col auto-cols-[17.5rem] sm:auto-cols-[minmax(18rem,1fr)] lg:auto-cols-[minmax(15rem,1fr)] gap-3 sm:gap-4 xl:gap-5 items-stretch overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-1 pb-3 [scrollbar-width:thin]">
      {TICKET_BOARD_COLUMNS.map(status => (
        <div key={status} className="min-w-0 snap-start">
          <TicketBoardColumn
            status={status}
            tickets={byStatus.get(status) ?? []}
            draggable={draggable}
            onOpen={onOpen}
            departmentNames={departmentNames}
          />
        </div>
      ))}
    </div>
  );
});
