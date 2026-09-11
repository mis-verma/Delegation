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

// Shared between the read-only (!isVerifier) and draggable (verifier) boards below — only the
// `draggable` flag differs, so this is the one place the columns' responsive layout is defined.
//
// memo, and grouped once via useMemo rather than `tickets.filter(...)` inline per column: without
// this, TicketBoard's own drag state (activeTicket, which changes on every pickup/drop) re-rendered
// this component, which recomputed a brand-new filtered array for every column and forced every
// ticket card to redo its own rendering work before the card could visually lift — the "laggy
// pickup" bug fixed on the Delegation board (see TaskBoard.tsx's Column memo comment). Grouping
// once means each column's ticket array is only a new reference when `tickets` itself actually
// changes, and memo lets React skip this whole subtree otherwise.
export const TicketBoardColumnsRow = memo(({ tickets, draggable, onOpen, departmentNames }: TicketBoardColumnsRowProps) => {
  const byStatus = useMemo(() => {
    const map = new Map<Ticket['status'], Ticket[]>();
    for (const status of TICKET_BOARD_COLUMNS) map.set(status, []);
    for (const ticket of tickets) map.get(ticket.status)?.push(ticket);
    return map;
  }, [tickets]);

  return (
    <div className="flex xl:grid xl:grid-cols-5 gap-4 xl:gap-5 items-stretch overflow-x-auto xl:overflow-visible snap-x snap-mandatory xl:snap-none pb-2 xl:pb-0 -mx-4 px-4 sm:-mx-6 sm:px-6 xl:mx-0 xl:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      {TICKET_BOARD_COLUMNS.map(status => (
        <div key={status} className="flex-1 min-w-[280px] sm:min-w-[320px] xl:min-w-0 snap-start">
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
