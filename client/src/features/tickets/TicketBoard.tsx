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

const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

interface TicketBoardProps {
  tickets: Ticket[];
  departmentNames?: Map<string, string>;
  onOpen: (ticket: Ticket) => void;
}

const columnName = (id: unknown) => STATUS_CONFIG[id as Ticket['status']]?.label ?? String(id);

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
  const [overlayWidth, setOverlayWidth] = useState<number | undefined>(undefined);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_SLOP_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

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

    if (newStatus === 'CLOSED') {
      if (ticket.status !== 'PENDING_APPROVAL') {
        toast.error('Only completed work can be closed.', {
          description: 'Mark it completed first, then the reviewer approves it.',
        });
        return;
      }
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