import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { TicketCard } from '../TicketCard';
import { DRAG_SLOP_PX } from '../../../lib/dragSlop';
import type { Ticket } from '../../../api/ticket';
import { useAuth } from '../../../context/AuthContext';
import { canChangeTicket } from '../ticketPermissions';

export interface DraggableTicketCardProps {
  ticket: Ticket;
  onOpen: (ticket: Ticket) => void;
  departmentName?: string;
}

export const DraggableTicketCard = ({ ticket, onOpen, departmentName }: DraggableTicketCardProps) => {
  const { user } = useAuth();
  const movable = canChangeTicket(user, ticket);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id, disabled: !movable });
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDownCapture={(e) => { pressOrigin.current = { x: e.clientX, y: e.clientY }; }}
      onClickCapture={(e) => {
        const origin = pressOrigin.current;
        pressOrigin.current = null;
        if (!origin) return;
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > DRAG_SLOP_PX) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={`relative group touch-manipulation transition-all duration-200 ease-in-out ${
        isDragging
          ? 'opacity-30 cursor-grabbing z-50 scale-95'
          : movable ? 'cursor-grab' : ''
      }`}
    >
      <TicketCard ticket={ticket} onClick={onOpen} departmentName={departmentName} variant="board" />
    </div>
  );
};
