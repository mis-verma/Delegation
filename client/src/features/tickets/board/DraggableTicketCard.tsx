import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { TicketCard } from '../TicketCard';
import { DRAG_SLOP_PX } from '../../../lib/dragSlop';
import type { Ticket } from '../../../api/ticket';

export interface DraggableTicketCardProps {
  ticket: Ticket;
  onOpen: (ticket: Ticket) => void;
  departmentName?: string;
}

export const DraggableTicketCard = ({ ticket, onOpen, departmentName }: DraggableTicketCardProps) => {
  // `attributes` supplies the role/tabIndex/aria-roledescription/aria-disabled that make this
  // element actually keyboard-focusable and screen-reader-legible — without spreading it, the
  // board's KeyboardSensor and screen-reader `announcements` (wired up in TicketBoard.tsx) have
  // nothing to attach to, so keyboard-only drag-and-drop silently doesn't work despite being
  // configured.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id });
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDownCapture={(e) => { pressOrigin.current = { x: e.clientX, y: e.clientY }; }}
      // A finished drag still emits a click on release, which lands on TicketCard's onClick and
      // opens the detail sheet every time a ticket is moved. Comparing release position against
      // press position separates a drag from a tap without waiting on dnd-kit's internal state to
      // settle before the browser dispatches the click.
      onClickCapture={(e) => {
        const origin = pressOrigin.current;
        pressOrigin.current = null;
        if (!origin) return;
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > DRAG_SLOP_PX) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      // `touch-manipulation`, not `touch-none`: `touch-action: none` means the browser handles no
      // gestures here at all, and since cards fill the columns — which sit in a horizontal
      // snap-scroll container below xl — a finger landing on a card could scroll the board neither
      // sideways nor down. The TouchSensor's press-and-hold is what marks a drag now.
      className={`relative group touch-manipulation transition-all duration-200 ease-in-out ${
        isDragging
          ? 'opacity-30 cursor-grabbing z-50 scale-95'
          : 'cursor-grab'
      }`}
    >
      <TicketCard ticket={ticket} onClick={onOpen} departmentName={departmentName} variant="board" />
    </div>
  );
};
