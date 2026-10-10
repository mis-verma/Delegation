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
    // One column per status laid out in a row of equal tracks. A track is never narrower than its
    // floor (17.5rem on phones, 18rem at sm, 15rem from lg), so a card is never squeezed. Five 15rem
    // floors plus gaps need about 1184px, more than the lg/xl content area (about 700/940px), so
    // there the row scrolls sideways and snaps column by column; only on wider screens do the
    // tracks stretch to fill the area with no gutter. The scrollbar stays thin and visible, since
    // nothing else says the row scrolls.
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
