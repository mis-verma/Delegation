import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Inbox } from 'lucide-react';
import { EmptyState } from '../../../components';
import { TicketCard } from '../TicketCard';
import { STATUS_CONFIG } from '../ticketDisplay';
import type { Ticket } from '../../../api/ticket';
import { DraggableTicketCard } from './DraggableTicketCard';

export interface TicketBoardColumnProps {
  status: Ticket['status'];
  tickets: Ticket[];
  draggable: boolean;
  onOpen: (ticket: Ticket) => void;
  departmentNames?: Map<string, string>;
}

// memo: see TicketBoardColumnsRow's comment — this is the piece that actually stops a drag
// pickup/drop elsewhere on the board from re-rendering every column's cards.
export const TicketBoardColumn = memo(({ status, tickets, draggable, onOpen, departmentNames }: TicketBoardColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !draggable });
  const config = STATUS_CONFIG[status];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-3 rounded-2xl border min-w-0 p-2.5 transition-all duration-300 h-full ${
        isOver
          ? 'border-primary-400/50 bg-primary-500/5 shadow-[0_0_20px_rgba(var(--color-primary-500),0.05)] scale-[1.01]'
          : 'border-border/40 bg-surface-hover/30 hover:bg-surface-hover/50'
      }`}
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex items-center justify-center size-2.5">
            <span className={`absolute inset-0 rounded-full blur-sm opacity-60 ${config.dot}`} />
            <span className={`relative size-2 rounded-full shrink-0 ${config.dot}`} aria-hidden="true" />
          </div>
          <h3 className="text-[13px] font-display font-bold text-text tracking-wide truncate">
            {config.label}
          </h3>
        </div>

        <span className="flex items-center justify-center min-w-[1.75rem] h-6 px-2 text-[11px] font-bold text-text-secondary rounded-full bg-surface border border-border/50 shadow-sm tabular-nums">
          {tickets.length}
        </span>
      </div>

      <div className="flex flex-col gap-3 min-h-40">
        {tickets.length === 0 ? (
          <EmptyState size="compact" icon={Inbox} title="No tickets here" />
        ) : draggable ? (
          tickets.map((ticket) => (
            <DraggableTicketCard
              key={ticket.id}
              ticket={ticket}
              onOpen={onOpen}
              departmentName={ticket.departmentId ? departmentNames?.get(ticket.departmentId) : undefined}
            />
          ))
        ) : (
          tickets.map((ticket) => (
            <div key={ticket.id} className="transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <TicketCard
                ticket={ticket}
                onClick={onOpen}
                departmentName={ticket.departmentId ? departmentNames?.get(ticket.departmentId) : undefined}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
});
