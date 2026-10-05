import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  defaultDropAnimationSideEffects,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type DropAnimation,
} from '@dnd-kit/core';
import { useState } from 'react';
import { toast } from 'sonner';
import { TicketCard } from './TicketCard';
import { useTicketStatusMove } from './useTicketStatusMove';
import { useVerifyTicketMutation } from './hook';
import type { Ticket } from '../../api/ticket';
import { TicketBoardColumnsRow } from './board/TicketBoardColumnsRow';
import { DRAG_SLOP_PX } from '../../lib/dragSlop';

/**
 * The drop is decided by the pointer, not by the card's outline.
 *
 * dnd-kit defaults to `rectIntersection`, which awards the drop to whichever column shares the
 * most *area* with the dragged card. A ticket card is nearly as wide as its column, so mid-drag it
 * always straddles two, and the winner was whichever way the card's body leaned rather than the
 * column under the cursor — tickets landed one column over from where they were aimed.
 *
 * `rectIntersection` stays as the fallback for a cursor in the gutter between columns: the card
 * still overlaps one, so the drop is forgiving. With the cursor over nothing and the card
 * overlapping nothing, both return empty and the drag cancels — what dragging off the board should
 * do.
 */
const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

interface TicketBoardProps {
  tickets: Ticket[];
  departmentNames?: Map<string, string>;
  isVerifier?: boolean;
  onOpen: (ticket: Ticket) => void;
}

// Configures a smooth "snap-back" or "drop" animation
const dropAnimationConfig: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.4',
      },
    },
  }),
};

export const TicketBoard = ({ tickets, departmentNames, isVerifier = false, onOpen }: TicketBoardProps) => {
  const verifyMutation = useVerifyTicketMutation();
  const { requestMove, statusRemarkDialog } = useTicketStatusMove();
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  // Width of the card being dragged, so the overlay matches whatever the column track is at this
  // breakpoint instead of a hardcoded size that is wrong at two of the three.
  const [overlayWidth, setOverlayWidth] = useState<number | undefined>(undefined);

  // Mouse, touch and keyboard are three different gestures and need three different activation
  // rules. One PointerSensor treated a finger exactly like a mouse, so a 5px swipe starting on a
  // card began a drag instead of scrolling — and this board's columns live in a horizontal
  // snap-scroll container, so that swipe is the primary way to move around it. A finger now has
  // to press and hold to pick a card up.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_SLOP_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  // Screen reader announcements for accessibility compliance
  const announcements = {
    onDragStart(_event: DragStartEvent) {
      return `Picked up ticket.`;
    },
    onDragOver({ over }: DragOverEvent) {
      if (over) return `Ticket moved over column ${over.id}.`;
      return `Ticket is no longer over a column.`;
    },
    onDragEnd({ over }: DragEndEvent) {
      if (over) return `Ticket dropped into column ${over.id}.`;
      return `Ticket drop cancelled.`;
    },
    onDragCancel() {
      return `Dragging was cancelled.`;
    },
  };

  const handleDragStart = (event: DragStartEvent) => {
    // Add a slight haptic feedback pattern for mobile users if supported
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
    setOverlayWidth(event.active.rect.current.initial?.width);
    setActiveTicket(tickets.find(t => t.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTicket(null);

    const newStatus = event.over?.id as Ticket['status'] | undefined;
    if (!newStatus) return;

    const ticket = tickets.find(t => t.id === event.active.id);
    if (!ticket || ticket.status === newStatus) return;

    // Validation rule
    if (newStatus === 'CLOSED') {
      // Server-side /verify is PC/ADMIN-only (see ticket.routes.ts) — reject client-side with a
      // clear reason instead of letting the request round-trip into a 403, same posture as
      // useTaskStatusMove's own "done" guard.
      if (!isVerifier) {
        toast.error('Only a verifier can close a ticket. Send it for review instead.');
        return;
      }
      if (ticket.status !== 'PENDING_APPROVAL') {
        toast.error('Move to Pending Approval before closing a ticket.', {
          description: 'Only fully reviewed tickets can be closed.',
        });
        return; // The dropAnimationConfig will smoothly snap it back to its original column
      }
      verifyMutation.mutate({ id: ticket.id, payload: { action: 'APPROVE' } });
      return;
    }

    // Everything else goes through the remark gate. This used to be a bare
    // `updateMutation.mutate({ status })`, which changed the status but wrote no
    // TicketStatusUpdate row and asked for no remark — so the ticket's history was missing every
    // move made from the board, while the identical move from the detail sheet recorded both.
    requestMove(ticket, newStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTicket(null)}
    >
      <TicketBoardColumnsRow tickets={tickets} draggable onOpen={onOpen} departmentNames={departmentNames} />

      <DragOverlay dropAnimation={dropAnimationConfig}>
        {activeTicket && (
         
          <div
            style={{ width: overlayWidth }}
            className="max-w-[85vw] rotate-2 scale-[1.02] cursor-grabbing rounded-2xl overflow-hidden border border-primary-500/40 ring-2 ring-primary-500/20 bg-surface transform-gpu transition-transform will-change-transform z-50"
          >
            <TicketCard
              ticket={activeTicket}
              onClick={onOpen}
              departmentName={activeTicket.departmentId ? departmentNames?.get(activeTicket.departmentId) : undefined}
            />
          </div>
        )}
      </DragOverlay>

      {statusRemarkDialog}
    </DndContext>
  );
};