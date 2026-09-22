import {
  DndContext, DragOverlay, useDraggable, useDroppable, MouseSensor, TouchSensor, useSensor, useSensors,
  pointerWithin, rectIntersection, defaultDropAnimationSideEffects,
  type CollisionDetection, type DropAnimation, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { memo, useMemo, useRef, useState } from 'react';
import { Inbox, Plus, AlertTriangle, ChevronDown } from "lucide-react";
import { EmptyState } from "../../components";
import { Badge } from "../../components/ui/badge";
import { TaskCard } from "./TaskCard";
import { useTaskStatusMove } from "./useTaskStatusMove";
import { DRAG_SLOP_PX } from "../../lib/dragSlop";
import { isOverdueTask } from "./taskFilters";
import { buildBoardColumns, type BoardGroupBy } from "./taskBoardGroups";
import { taskAssigneeIds, type CardFieldVisibility } from "./cardFields";
import type { Task } from "../../api/task";

const resolveAssigneeNames = (task: Task, assigneeNames: Map<string, string>) =>
  taskAssigneeIds(task).map((id) => assigneeNames.get(id)).filter((n): n is string => !!n);

// task.userId is whoever raised/created the delegation — assignableUsers (the same map used to
// resolve assignee names) covers them too, since anyone assignable can also raise a delegation.
const resolveRaisedByName = (task: Task, assigneeNames: Map<string, string>) =>
  assigneeNames.get(task.userId);

/**
 * Where the card lands is decided by the pointer, not by the card's outline.
 *
 * dnd-kit's default is `rectIntersection`, which picks whichever droppable shares the most *area*
 * with the dragged card's rectangle. A delegation card is nearly as wide as a column, so while
 * dragging it always straddles two of them, and the winner was whichever side the card's body
 * happened to lean into — not the column under your cursor. Dropping "on" a column regularly moved
 * the task to its neighbour.
 *
 * `pointerWithin` asks the direct question instead: which column is the cursor inside? The
 * `rectIntersection` fallback covers the cursor being in the gutter between two columns — the card
 * still overlaps one, so the drop is forgiving rather than silently doing nothing. When the cursor
 * is over neither and the card overlaps nothing, both return empty and the drag cancels, which is
 * what dragging off the board should do.
 */
const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

// A slower, smoother ease-out (dnd-kit's default is a flat 250ms ease) so the card visibly
// settles into its new spot instead of just snapping there, plus a gentle fade so the overlay
// doesn't hard-cut away the instant the drop lands.
// Spelled out rather than interpolated: Tailwind scans source text, so `xl:grid-cols-${n}` would
// emit no CSS at all.
const XL_GRID_COLS: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
};

const DROP_ANIMATION: DropAnimation = {
  duration: 250,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.4' } },
  }),
};

interface TaskBoardProps {
  tasks: Task[];
  assigneeNames: Map<string, string>;
  departmentNames?: Map<string, string>;
  isVerifier?: boolean;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  onAddTask?: () => void;
  fields: CardFieldVisibility;
  /** Ids of tasks with an unread "you were just assigned this" notification — surfaces the same
   *  "New delegation from X" callout TaskRow shows in list view, so the cue isn't list-view-only. */
  newlyAssignedTaskIds?: Set<string>;
  /** True when a filter is narrowing the board — an empty column then means "none match", not
   *  "nothing here", and those call for different next moves. */
  isFiltered?: boolean;
  /** What the columns represent. Only 'status' columns accept a drop — see taskBoardGroups. */
  groupBy?: BoardGroupBy;
}

interface CardProps {
  task: Task;
  isVerifier: boolean;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  assigneeNames?: string[];
  raisedByName?: string;
  departmentName?: string;
  fields: CardFieldVisibility;
  isNewlyAssigned?: boolean;
  onMove?: (task: Task, toStatus: Task['status']) => void;
}

// Wraps TaskCard so the whole card can be picked up and dropped on another column.
//
// Deliberately spreads only `listeners` (the pointer handlers), not dnd-kit's `attributes` —
// those add their own `role="button" tabIndex={0}`, and since there's no KeyboardSensor wired
// up, that would just stack a second, non-functional keyboard stop on top of TaskCard's own
// role="button". The floating drag visual comes from DragOverlay below, so this node itself
// only needs to fade out while its content is "lifted".
//
// `touch-manipulation`, NOT `touch-none`: `touch-action: none` tells the browser to handle no
// gestures at all on this element, and since cards fill the columns, a finger landing anywhere on
// a card couldn't scroll the board. The board is now selectable at any width (it snap-scrolls
// horizontally below xl), so that hit touch tablets, touchscreen laptops and phones — exactly the
// devices most likely to drag a card in the first place. `manipulation` keeps scrolling and drops the legacy
// 300ms tap delay; the TouchSensor's press-and-hold constraint is what separates "drag this card"
// from "scroll the board".
const DraggableCard = ({ task, ...cardProps }: CardProps) => {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      onPointerDownCapture={(e) => { pressOrigin.current = { x: e.clientX, y: e.clientY }; }}
      // A drag that ends over another column still emits a click on release, which would land on
      // TaskCard's onClick and pop the detail modal open every time you moved a card. Comparing
      // release position against press position tells the two gestures apart without depending on
      // dnd-kit's internal state having settled before the browser dispatches the click.
      onClickCapture={(e) => {
        const origin = pressOrigin.current;
        pressOrigin.current = null;
        if (!origin) return;
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > DRAG_SLOP_PX) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={`touch-manipulation transition-opacity duration-200 ease-out ${
        isDragging ? 'opacity-40 cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <TaskCard task={task} {...cardProps} />
    </div>
  );
};

interface ColumnProps {
  /** Droppable id — a status value when grouping by status, otherwise an inert group key. */
  columnKey: string;
  label: string;
  tasks: Task[];
  /** Only a status column can accept a drop; see taskBoardGroups' BoardGroupBy doc. */
  isDropTarget: boolean;
  /** True when the whole set fits one screen at xl and becomes a grid; false keeps the floor
   *  width so eleven assignee columns stay scrollable instead of shrinking to slivers. */
  fillsRow: boolean;
  assigneeNames: Map<string, string>;
  departmentNames?: Map<string, string>;
  isVerifier: boolean;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  onAddTask?: () => void;
  fields: CardFieldVisibility;
  newlyAssignedTaskIds?: Set<string>;
  onMove?: (task: Task, toStatus: Task['status']) => void;
  /** Show at most this many cards, with a "show the rest" toggle below. Omit for no cap. */
  maxVisible?: number;
  /** True when a filter is narrowing the board — changes what an empty column means. */
  isFiltered?: boolean;
}

// memo: `activeTask` lives in the parent (TaskBoardComponent) and changes on every drag
// start/end. Without this, that state update re-renders every column's every card — each doing
// its own date maths, checklist progress and avatar colouring — synchronously before the card can
// even visually lift, which is exactly what a laggy-feeling pickup is. None of this column's own
// props change when a drag starts elsewhere on the board, so memoizing lets React skip it
// entirely (this depends on `onMove` having a stable identity — see useTaskStatusMove's own
// comment on `requestMove`).
const Column = memo(({ columnKey, label, tasks, isDropTarget, fillsRow, assigneeNames, departmentNames, isVerifier, onOpen, onAddTask, fields, newlyAssignedTaskIds, onMove, maxVisible, isFiltered }: ColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey, disabled: !isDropTarget });
  const [expanded, setExpanded] = useState(false);

  const isCapped = maxVisible !== undefined && !expanded && tasks.length > maxVisible;
  const visible = isCapped ? tasks.slice(0, maxVisible) : tasks;
  const hiddenCount = tasks.length - visible.length;
  const canToggle = maxVisible !== undefined && tasks.length > maxVisible;

  // What's actually at risk in this column. A count alone says how much work sits here; this says
  // whether any of it has already slipped, which is the number that decides where to look first.
  const overdueCount = tasks.filter(isOverdueTask).length;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${label} — ${tasks.length} delegation${tasks.length === 1 ? '' : 's'}${overdueCount ? `, ${overdueCount} overdue` : ''}`}
      // h-full pairs with the grid dropping `items-start`: every column now stretches to the
      // height of the tallest, so the whole vertical band under a column accepts a drop.
      // Below xl the board is a horizontal scroller, so each column also needs a floor width and a
      // snap point; from xl it's a real grid again and those are handed back to the grid.
      className={`flex flex-col gap-2 h-full rounded-lg border p-2 transition-colors duration-200 ease-in-out flex-1 min-w-[280px] sm:min-w-[320px] snap-start ${
        fillsRow ? 'xl:min-w-0' : ''
      } ${isOver ? 'border-primary-400 bg-primary-500/8' : 'border-border bg-surface'}`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-xs font-bold text-text-secondary truncate">
            {label}
          </h3>
          <Badge variant="default" className="min-w-6 justify-center bg-primary-500/10 tabular-nums">
            {tasks.length}
          </Badge>
        </div>

        {overdueCount > 0 && (
          <Badge
            variant="destructive"
            title={`${overdueCount} of these ${overdueCount === 1 ? 'is' : 'are'} past its due date`}
            className="bg-danger/10 tabular-nums shrink-0"
          >
            <AlertTriangle size={11} strokeWidth={2.5} />
            {overdueCount}
          </Badge>
        )}
      </div>

      {/* flex-1 so the leftover space in a short column belongs to the card area rather than
          collapsing — that empty space is the easiest part of a column to aim at. */}
      <div className="flex flex-col gap-2.5 flex-1 min-h-36">
        {tasks.length === 0 ? (
          // "No delegations" was a lie whenever a filter was on — the column may be full, just
          // not of anything matching. Different fact, different next move.
          <EmptyState size="compact" icon={Inbox} title={isFiltered ? 'None match your filters' : 'No delegations here'} />
        ) : (
          visible.map(task => (
            <DraggableCard
              key={task.id}
              task={task}
              isVerifier={isVerifier}
              onOpen={onOpen}
              assigneeNames={resolveAssigneeNames(task, assigneeNames)}
              raisedByName={resolveRaisedByName(task, assigneeNames)}
              departmentName={task.departmentId ? departmentNames?.get(task.departmentId) : undefined}
              fields={fields}
              isNewlyAssigned={newlyAssignedTaskIds?.has(task.id)}
              onMove={onMove}
            />
          ))
        )}
      </div>

      {canToggle && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-md text-[11px] font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {expanded ? 'Show fewer' : `Show ${hiddenCount} more`}
          <ChevronDown size={13} className={`transition-transform duration-200 ease-in-out ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* New tasks always start in "To Do" server-side, so a quick-add only makes sense here —
          it reuses the same handler as the toolbar's "New Task" button. */}
      {onAddTask && (
        <button
          type="button"
          onClick={onAddTask}
          className="flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-md border border-dashed border-border text-xs font-medium text-text-muted hover:border-primary-400 hover:text-primary-600 transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Plus size={14} />
          Add new task
        </button>
      )}
    </section>
  );
});

// memo: every prop TaskList passes is now referentially stable, so the board (and with it every
// card, each of which does date maths, checklist progress and avatar colouring) no longer
// re-renders when unrelated page state changes — opening a dialog, typing in a filter, a socket
// invalidation landing.
const TaskBoardComponent = ({ tasks, assigneeNames, departmentNames, isVerifier = false, onOpen, onAddTask, fields, newlyAssignedTaskIds, isFiltered, groupBy = 'status' }: TaskBoardProps) => {
  const { requestMove, statusRemarkDialog } = useTaskStatusMove(isVerifier);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const byStatus = groupBy === 'status';
  const columns = useMemo(
    () => buildBoardColumns(tasks, groupBy, departmentNames, assigneeNames),
    [tasks, groupBy, departmentNames, assigneeNames],
  );
  // Status and Priority always fit; grouping by department or assignee can produce a dozen
  // columns, which as a grid would be a dozen slivers. Those stay a scroller at every width.
  const fitsOneRow = columns.length > 0 && columns.length <= 4;
  // Split sensors instead of one PointerSensor. PointerSensor treats touch and mouse identically,
  // so an 8px activation distance meant any finger swipe starting on a card began a drag rather
  // than scrolling the board. A mouse gets the distance threshold (drag starts as soon as you
  // clearly mean it); a finger gets press-and-hold, with `tolerance` allowing a little wobble
  // during the hold before the gesture is handed back to the browser as a scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_SLOP_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find(t => t.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    // Columns are only droppable when they're statuses, so `over.id` is a status here or nothing.
    if (!byStatus) return;

    const newStatus = event.over?.id as Task['status'] | undefined;
    if (!newStatus) return;

    const task = tasks.find(t => t.id === event.active.id);
    if (task) requestMove(task, newStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      {/* Horizontal scroller below xl, real 4-up grid from xl — the same shape TicketBoard's
          columns row already uses, so the two boards behave identically.
          It replaced `sm:grid-cols-2`, which wrapped the four statuses into a 2×2 block: a
          pipeline you read left-to-right became a square, and Done ended up underneath To Do.
          Scrolling keeps the order intact at every width. The negative margins bleed the scroll
          track to the viewport edge so a half-visible next column signals there's more.
          No `items-start` anywhere: it sized each column to its own contents, so a column holding
          one card was a ~250px drop target beside a column 1000px tall, and releasing below it did
          nothing. Stretched columns make the entire row height a valid target. */}
      <div
        className={`flex gap-4 items-stretch overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          fitsOneRow ? `xl:grid ${XL_GRID_COLS[columns.length]} xl:overflow-visible xl:snap-none xl:pb-0 xl:mx-0 xl:px-0` : ''
        }`}
      >
        {columns.map(column => (
          <Column
            key={column.key}
            columnKey={column.key}
            label={column.label}
            tasks={column.tasks}
            isDropTarget={byStatus}
            fillsRow={fitsOneRow}
            assigneeNames={assigneeNames}
            departmentNames={departmentNames}
            isVerifier={isVerifier}
            onOpen={onOpen}
            // New delegations always start in "To Do" server-side, so quick-add only belongs on
            // that column — and only while the board is actually grouped by status.
            onAddTask={byStatus && column.key === 'todo' ? onAddTask : undefined}
            fields={fields}
            newlyAssignedTaskIds={newlyAssignedTaskIds}
            onMove={requestMove}
            // Done only ever grows and is almost entirely history. Capped so a board six months
            // old doesn't open with a column of two hundred cards nobody scrolls; every other
            // column holds live work, where hiding anything behind a toggle would be wrong.
            maxVisible={byStatus && column.key === 'done' ? 8 : undefined}
            isFiltered={isFiltered}
          />
        ))}
      </div>

      {/* Renders the dragged card in a top-level portal with its own transform, instead of
          translating the source node in place — keeps it visually above every column
          regardless of stacking context, and gives it a "lifted" tilt/shadow as feedback. */}
      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {activeTask && (
          // No width class: dnd-kit sizes the overlay wrapper from the dragged card's measured
          // rect, so `w-full` makes the ghost exactly the width of the card you picked up. The old
          // fixed `w-60` was right for one column width and wrong at every other breakpoint.
          <div className="w-full rotate-1 scale-105 shadow-xl cursor-grabbing will-change-transform">
            <TaskCard
              task={activeTask}
              isVerifier={isVerifier}
              onOpen={onOpen}
              assigneeNames={resolveAssigneeNames(activeTask, assigneeNames)}
              raisedByName={resolveRaisedByName(activeTask, assigneeNames)}
              departmentName={activeTask.departmentId ? departmentNames?.get(activeTask.departmentId) : undefined}
              fields={fields}
            />
          </div>
        )}
      </DragOverlay>

      {statusRemarkDialog}
    </DndContext>
  );
};

export const TaskBoard = memo(TaskBoardComponent);
