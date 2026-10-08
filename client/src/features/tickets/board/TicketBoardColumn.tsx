import { memo, useMemo, useState } from 'react';
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

// Closed tickets only ever pile up, so the Closed column shows the last two weeks and keeps the
// rest behind a button. Without this, one long-running board renders hundreds of finished cards.
const CLOSED_WINDOW_MS = 14 * 86_400_000;

// memo: see TicketBoardColumnsRow's comment — this is the piece that actually stops a drag
// pickup/drop elsewhere on the board from re-rendering every column's cards.
export const TicketBoardColumn = memo(({ status, tickets, draggable, onOpen, departmentNames }: TicketBoardColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !draggable });
  const config = STATUS_CONFIG[status];
  const [showOlder, setShowOlder] = useState(false);
  const visible = useMemo(() => {
    if (status !== 'CLOSED' || showOlder) return tickets;
    const cutoff = Date.now() - CLOSED_WINDOW_MS;
    return tickets.filter((t) => new Date(t.closedAt ?? t.updatedAt).getTime() >= cutoff);
  }, [status, showOlder, tickets]);
  const hiddenCount = tickets.length - visible.length;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-3 rounded-2xl border min-w-0 p-2 sm:p-2.5 transition-colors duration-300 h-full ${
        isOver
          ? 'border-primary-400/60 bg-primary-500/5 ring-2 ring-primary-400/25'
          : 'border-border/40 bg-surface-hover/30 hover:bg-surface-hover/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex items-center justify-center size-2.5">
            <span className={`absolute inset-0 rounded-full blur-sm opacity-60 ${config.dot}`} />
            <span className={`relative size-2 rounded-full shrink-0 ${config.dot}`} aria-hidden="true" />
          </div>
          <h3 className="text-sm font-display font-semibold text-text tracking-tight leading-tight break-words">
            {config.label}
          </h3>
        </div>

        <span className="flex items-center justify-center shrink-0 min-w-7 h-6 px-2 text-[0.6875rem] font-bold text-text-secondary rounded-full bg-surface border border-border/50 tabular-nums">
          {tickets.length}
        </span>
      </div>

      <div className="flex flex-col gap-3 min-h-40">
        {visible.length === 0 && hiddenCount === 0 ? (
          <EmptyState size="compact" icon={Inbox} title="No tickets here" />
        ) : draggable ? (
          visible.map((ticket) => (
            <DraggableTicketCard
              key={ticket.id}
              ticket={ticket}
              onOpen={onOpen}
              departmentName={ticket.departmentId ? departmentNames?.get(ticket.departmentId) : undefined}
            />
          ))
        ) : (
          visible.map((ticket) => (
            <div key={ticket.id} className="transition-transform duration-300 hover:-translate-y-0.5">
              <TicketCard
                ticket={ticket}
                onClick={onOpen}
                variant="board"
                departmentName={ticket.departmentId ? departmentNames?.get(ticket.departmentId) : undefined}
              />
            </div>
          ))
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowOlder(true)}
            className="h-10 pointer-coarse:h-11 rounded-lg border border-dashed border-border text-xs font-display font-semibold text-text-muted hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            Show {hiddenCount} older closed
          </button>
        )}
      </div>
    </div>
  );
});
