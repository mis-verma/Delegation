import { haptic } from '../../lib/haptics';
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
import { BoardTouchHint } from '../../components/BoardTouchHint';
import { DRAG_SLOP_PX } from '../../lib/dragSlop';
import { STATUS_CONFIG } from './ticketDisplay';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '@/components/confirmDialog';
import { canApproveWork } from '../../lib/canApproveWork';

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
  onOpen: (ticket: Ticket) => void;
}

// Screen readers should hear "Pending Approval", not the raw status key.
const columnName = (id: unknown) => STATUS_CONFIG[id as Ticket['status']]?.label ?? String(id);

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

export const TicketBoard = ({ tickets, departmentNames, onOpen }: TicketBoardProps) => {
  const { user } = useAuth();
  const confirm = useConfirm();
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
      if (over) return `Ticket moved over column ${columnName(over.id)}.`;
      return `Ticket is no longer over a column.`;
    },
    onDragEnd({ over }: DragEndEvent) {
      if (over) return `Ticket dropped into column ${columnName(over.id)}.`;
      return `Ticket drop cancelled.`;
    },
    onDragCancel() {
      return `Dragging was cancelled.`;
    },
  };

  const handleDragStart = (event: DragStartEvent) => {
    // A short tick when a card is picked up (Android phones only).
    haptic('tap');
    setOverlayWidth(event.active.rect.current.initial?.width);
    setActiveTicket(tickets.find(t => t.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTicket(null);

    const newStatus = event.over?.id as Ticket['status'] | undefined;
    if (!newStatus) return;

    const ticket = tickets.find(t => t.id === event.active.id);
    if (!ticket || ticket.status === newStatus) return;

    // Dropping into Closed is an approval, so it follows the approval rules and asks first.
    if (newStatus === 'CLOSED') {
      if (ticket.status !== 'PENDING_APPROVAL') {
        toast.error('Only completed work can be closed.', {
          description: 'Mark it completed first, then the reviewer approves it.',
        });
        return; // The dropAnimationConfig will smoothly snap it back to its original column
      }
      // Same rule as the Approve button and the server's assertCanVerify (lib/canApproveWork).
      const canApprove = canApproveWork(user, {
        departmentId: ticket.departmentId,
        assigneeIds: ticket.assigneeId ? [ticket.assigneeId] : [],
        reviewers: ticket.reviewers,
      });
      if (!canApprove) {
        toast.error("You can't approve this ticket.", {
          description: ticket.assigneeId === user?.id
            ? 'It is assigned to you, so someone else has to review it.'
            : 'The reviewer approves it from the ticket or the Verification page.',
        });
        return;
      }
      void confirm({
        title: 'Approve and close this ticket?',
        description: `"${ticket.title}" will be closed as approved. Open the ticket first if you want to check the work or add a note.`,
        confirmLabel: 'Approve and close',
        cancelLabel: 'Not yet',
      }).then((ok) => {
        if (ok) verifyMutation.mutate({ id: ticket.id, payload: { action: 'APPROVE' } });
      });
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
      <div className="flex flex-col gap-3">
      <BoardTouchHint />
      <TicketBoardColumnsRow tickets={tickets} draggable onOpen={onOpen} departmentNames={departmentNames} />
      </div>

      <DragOverlay dropAnimation={dropAnimationConfig}>
        {activeTicket && (
         
          <div
            style={{ width: overlayWidth }}
            className="max-w-[85vw] rotate-2 scale-[1.02] cursor-grabbing rounded-2xl overflow-hidden border border-primary-500/40 ring-2 ring-primary-500/20 bg-surface transform-gpu transition-transform will-change-transform z-50"
          >
            <TicketCard
              ticket={activeTicket}
              onClick={onOpen}
              variant="board"
              departmentName={activeTicket.departmentId ? departmentNames?.get(activeTicket.departmentId) : undefined}
            />
          </div>
        )}
      </DragOverlay>

      {statusRemarkDialog}
    </DndContext>
  );
};