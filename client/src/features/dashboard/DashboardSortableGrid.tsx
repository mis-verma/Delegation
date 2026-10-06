import { useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DRAG_SLOP_PX } from '../../lib/dragSlop';
import { DashboardCardFrame, CardCustomizeStrip } from './DashboardCardFrame';
import { CARD_LABEL, type DashboardCardId, type DashboardCardSize } from './dashboardLayout';

interface SortableFrameProps {
  id: DashboardCardId;
  size: DashboardCardSize;
  onSizeChange: (size: DashboardCardSize) => void;
  onHide: () => void;
  children: ReactNode;
}

const SortableFrame = ({ id, size, onSizeChange, onHide, children }: SortableFrameProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`has-[>div>div:last-child:empty]:hidden ${size === 'big' ? 'sm:col-span-2' : ''}`}>
      <DashboardCardFrame
        size="small"
        isDragging={isDragging}
        strip={<CardCustomizeStrip label={CARD_LABEL[id]} size={size} onSizeChange={onSizeChange} onHide={onHide} handleProps={{ ...attributes, ...listeners }} />}
      >
        {children}
      </DashboardCardFrame>
    </div>
  );
};

interface DashboardSortableGridProps {
  order: DashboardCardId[];
  sizes: Record<DashboardCardId, DashboardCardSize>;
  renderCard: (id: DashboardCardId) => ReactNode;
  onMove: (activeId: DashboardCardId, overId: DashboardCardId) => void;
  onSizeChange: (id: DashboardCardId, size: DashboardCardSize) => void;
  onHide: (id: DashboardCardId) => void;
}

// The drag-and-drop layer of the dashboard grid. Loaded lazily by HomePage only after the viewer
// starts Customize, so the sensors, DndContext and sortable machinery never cost anything for
// someone who just wants to look at their numbers.
const DashboardSortableGrid = ({ order, sizes, renderCard, onMove, onSizeChange, onHide }: DashboardSortableGridProps) => {
  const [activeDragId, setActiveDragId] = useState<DashboardCardId | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_SLOP_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => setActiveDragId(event.active.id as DashboardCardId);
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) onMove(active.id as DashboardCardId, over.id as DashboardCardId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 [grid-auto-flow:row_dense] gap-4 md:gap-6 pb-8">
          {order.map((id) => (
            <SortableFrame key={id} id={id} size={sizes[id]} onSizeChange={(size) => onSizeChange(id, size)} onHide={() => onHide(id)}>
              {renderCard(id)}
            </SortableFrame>
          ))}
        </div>
      </SortableContext>

      {/* A floating copy of whatever's being dragged, lifted by a slight tilt and a stronger border
          rather than a shadow; the card left behind in the grid is what the frame's own opacity
          drop shows, not a second placeholder drawn here. */}
      <DragOverlay>
        {activeDragId && (
          <div className="rotate-1 rounded-2xl border border-primary-500/50 cursor-grabbing">{renderCard(activeDragId)}</div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default DashboardSortableGrid;
