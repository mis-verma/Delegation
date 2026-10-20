import {
  DndContext, DragOverlay, useDraggable, useDroppable, MouseSensor, TouchSensor, useSensor, useSensors,
  pointerWithin, rectIntersection, defaultDropAnimationSideEffects,
  type CollisionDetection, type DropAnimation, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Inbox, Plus, AlertTriangle, ChevronDown } from "lucide-react";
import { EmptyState } from "../../components";
import { Badge } from "../../components/ui/badge";
import { BoardTouchHint } from "../../components/BoardTouchHint";
import { useAuth } from "../../context/AuthContext";
import { TaskCard } from "./TaskCard";
import { useTaskStatusMove } from "./useTaskStatusMove";
import { canMoveTask } from "./taskPermissions";
import { DRAG_SLOP_PX } from "../../lib/dragSlop";
import { isOverdueTask } from "./taskFilters";
import { buildBoardColumns, type BoardGroupBy } from "./taskBoardGroups";
import { taskAssigneeIds, type CardFieldVisibility } from "./cardFields";
import { STATUS_ICON } from "./taskDisplay";
import type { Task } from "../../api/task";

const resolveAssigneeNames = (task: Task, assigneeNames: Map<string, string>) =>
  taskAssigneeIds(task).map((id) => assigneeNames.get(id)).filter((n): n is string => !!n);

const resolveRaisedByName = (task: Task, assigneeNames: Map<string, string>) =>
  assigneeNames.get(task.userId);

const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

const XL_GRID_COLS: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
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
  newlyAssignedTaskIds?: Set<string>;
  isFiltered?: boolean;
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
  movable: boolean;
}

const DraggableCard = ({ task, movable, ...cardProps }: CardProps) => {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !movable });
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
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
      className={`touch-manipulation transition-opacity duration-200 ease-out ${
        isDragging ? 'opacity-40 cursor-grabbing' : movable ? 'cursor-grab' : ''
      }`}
    >
      <TaskCard task={task} {...cardProps} />
    </div>
  );
};

interface ColumnProps {
  columnKey: string;
  label: string;
  tasks: Task[];
  isDropTarget: boolean;
  fillsRow: boolean;
  assigneeNames: Map<string, string>;
  departmentNames?: Map<string, string>;
  isVerifier: boolean;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  onAddTask?: () => void;
  fields: CardFieldVisibility;
  newlyAssignedTaskIds?: Set<string>;
  onMove?: (task: Task, toStatus: Task['status']) => void;
  canMove: (task: Task) => boolean;
  maxVisible?: number;
  isFiltered?: boolean;
}

const Column = memo(({ columnKey, label, tasks, isDropTarget, fillsRow, assigneeNames, departmentNames, isVerifier, onOpen, onAddTask, fields, newlyAssignedTaskIds, onMove, canMove, maxVisible, isFiltered }: ColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey, disabled: !isDropTarget });
  const [expanded, setExpanded] = useState(false);

  const isCapped = maxVisible !== undefined && !expanded && tasks.length > maxVisible;
  const visible = isCapped ? tasks.slice(0, maxVisible) : tasks;
  const hiddenCount = tasks.length - visible.length;
  const canToggle = maxVisible !== undefined && tasks.length > maxVisible;

  const overdueCount = tasks.filter(isOverdueTask).length;
  const statusIcon = isDropTarget ? STATUS_ICON[columnKey as Task['status']] : undefined;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${label}, ${tasks.length} delegation${tasks.length === 1 ? '' : 's'}${overdueCount ? `, ${overdueCount} overdue` : ''}`}
      className={`@container flex flex-col gap-2 h-full rounded-lg border p-2 transition-colors duration-200 ease-in-out flex-1 min-w-[280px] sm:min-w-[320px] snap-start ${
        fillsRow ? 'xl:min-w-0' : ''
      } ${isOver ? 'border-primary-400 bg-primary-500/8' : 'border-border/70 bg-surface-hover/40'}`}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {statusIcon && (
            <span aria-hidden="true" className="@max-[17rem]:hidden flex items-center justify-center size-7 rounded-lg bg-surface border border-border/70 text-text-secondary shrink-0">
              {statusIcon}
            </span>
          )}
          <h3 className="t-card font-display font-bold text-text leading-tight">
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

      <div className="flex flex-col gap-2.5 flex-1 min-h-36">
        {tasks.length === 0 ? (
          <EmptyState size="compact" icon={Inbox} title={isFiltered ? 'None match your filters' : 'No delegations here'} />
        ) : (
          visible.map(task => {
            const movable = canMove(task);
            return (
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
                onMove={movable ? onMove : undefined}
                movable={movable}
              />
            );
          })
        )}
      </div>

      {canToggle && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-md t-meta font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {expanded ? 'Show fewer' : `Show ${hiddenCount} more`}
          <ChevronDown size={13} className={`transition-transform duration-200 ease-in-out ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}

      {onAddTask && (
        <button
          type="button"
          onClick={onAddTask}
          className="flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-md border border-border t-meta font-medium text-text-muted hover:border-primary-400 hover:text-primary-600 transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Plus size={14} />
          Add new task
        </button>
      )}
    </section>
  );
});

const TaskBoardComponent = ({ tasks, assigneeNames, departmentNames, isVerifier = false, onOpen, onAddTask, fields, newlyAssignedTaskIds, isFiltered, groupBy = 'status' }: TaskBoardProps) => {
  const { requestMove, statusRemarkDialog } = useTaskStatusMove();
  const { user } = useAuth();
  const canMove = useCallback((task: Task) => canMoveTask(task, user), [user]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const byStatus = groupBy === 'status';
  const columns = useMemo(
    () => buildBoardColumns(tasks, groupBy, departmentNames, assigneeNames),
    [tasks, groupBy, departmentNames, assigneeNames],
  );
  const fitsOneRow = columns.length > 0 && columns.length <= 5;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_SLOP_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find(t => t.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    if (!byStatus) return;

    const newStatus = event.over?.id as Task['status'] | undefined;
    if (!newStatus) return;

    const task = tasks.find(t => t.id === event.active.id);
    if (task && canMove(task)) requestMove(task, newStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="flex flex-col gap-3">
      <BoardTouchHint />
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
            onAddTask={byStatus && column.key === 'todo' ? onAddTask : undefined}
            fields={fields}
            newlyAssignedTaskIds={newlyAssignedTaskIds}
            onMove={requestMove}
            canMove={canMove}
            maxVisible={byStatus && column.key === 'done' ? 8 : undefined}
            isFiltered={isFiltered}
          />
        ))}
      </div>
      </div>

      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {activeTask && (
          <div className="w-full rotate-1 scale-105 ring-2 ring-primary-500/20 rounded-lg cursor-grabbing will-change-transform">
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
