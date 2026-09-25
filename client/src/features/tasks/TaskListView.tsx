import { memo } from 'react';
import { StatusChip, DepartmentChip, TagChip, type StatusChipStatus } from '../../components';
import { PRIORITY_MAP } from './taskDisplay';
import { isOverdueTask } from './taskFilters';
import {
  subtaskProgress,
  formatShortDate,
  CATEGORY_CONFIG,
  type CardFieldVisibility,
} from './cardFields';
import { getChecklistProgress } from '../../lib/checklistProgress';
import type { Task } from '../../api/task';

interface TaskListViewProps {
  tasks: Task[];
  departmentNames?: Map<string, string>;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  fields: CardFieldVisibility;
  newlyAssignedTaskIds?: Set<string>;
}

const STATUS_CHIP_KEY = {
  // draft never actually reaches this view (the normal Task List excludes it — see
  // task.service.ts#list), but Task['status'] includes it structurally so this map still needs
  // an entry; 'open' is the closest neutral reading if one ever did.
  draft: 'open',
  todo: 'open',
  in_progress: 'in_progress',
  pending_approval: 'pending',
  done: 'completed',
} as const satisfies Record<Task['status'], StatusChipStatus>;

// "Today" and "Tomorrow" beat a date the reader has to compare against today's, which is the whole
// job of a due value. Anything further out is the plain short date.
const dueLabel = (iso: string) => {
  const startOfDay = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return formatShortDate(iso);
};

/**
 * The List view: compact tiles, two across.
 *
 * Two earlier attempts at this view were both wrong in the same way — a full-width row per
 * delegation, header row or not, which is a table, and Table already sits one tab away. Two per
 * row breaks that: the eye moves down two short columns instead of scanning one wide line, and
 * twice as many delegations fit on a screen.
 *
 * No owner here. On a page that is already scoped to a person most of the time, repeating the same
 * name down every tile spends the tile's most valuable space saying nothing — Table and Timeline
 * both carry the owner for when that is the question being asked.
 *
 * No "Move to" menu either: status changes from this view go through the tile's detail sheet, which
 * enforces the same remark gate. Board and Timeline keep their inline menus.
 */
const TaskListViewComponent = ({
  tasks,
  departmentNames,
  onOpen,
  fields,
  newlyAssignedTaskIds,
}: TaskListViewProps) => (
  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {tasks.map((task) => {
      const priority = PRIORITY_MAP[task.priority];
      const overdue = isOverdueTask(task);
      const progress = subtaskProgress(task);
      const checklist = getChecklistProgress(task.checklists ?? []);
      const department = task.departmentId ? departmentNames?.get(task.departmentId) : undefined;
      const isNew = newlyAssignedTaskIds?.has(task.id);

      return (
        <li key={task.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(task)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(task);
              }
            }}
            className="relative h-full flex flex-col gap-2 pl-4 pr-3 py-2.5 rounded-lg border border-border/60 bg-surface hover:border-primary-500/50 focus-visible:border-primary-500/50 focus-visible:outline-none transition-all duration-200 ease-in-out cursor-pointer overflow-hidden"
          >
            {/* Priority rail. aria-hidden because priority has no slot of its own on the tile —
                the sr-only line below carries it for a screen reader instead. */}
            <span
              aria-hidden
              className={`absolute left-0 top-0 bottom-0 w-1 ${priority.stripe}`}
            />

            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {isNew && (
                  <span
                    className="size-1.5 rounded-full bg-primary-500 shrink-0"
                    title="Newly assigned to you"
                  />
                )}
                {/* No truncate — this was cutting titles down to a handful of words ("Security
                    camera offline since ...") on a narrow phone card. Wraps instead. */}
                <span className="text-sm font-bold text-text-secondary tracking-tight leading-snug">
                  {task.title}
                </span>
              </div>
              {/* The reference layout also puts a task code and a comment count on this line.
                  Neither exists yet: ids are cuids with no short human code, and the list payload
                  carries no comment count. Type and checklist progress are real data. */}
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
                <span>{CATEGORY_CONFIG[task.category].label}</span>
                {progress && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      Checklist {progress.done}/{progress.total}
                    </span>
                  </>
                )}
                <span className="sr-only">{`. Priority ${priority.label}.`}</span>
              </div>
            </div>

            {/* mt-auto so tiles of differing title length still align their footers to the bottom
                of the row — a two-up grid stretches its cells to equal height. */}
            <div className="flex items-center gap-2 flex-wrap mt-auto">
              {fields.status && <StatusChip status={STATUS_CHIP_KEY[task.status]} />}

              {fields.department && department && <DepartmentChip name={department} />}

              {/* Capped at two with a +n overflow: a delegation carrying six labels would
                  otherwise push status and due date off the tile entirely. */}
              {task.tags?.slice(0, 2).map((tag) => <TagChip key={tag.id} tag={tag} />)}
              {(task.tags?.length ?? 0) > 2 && (
                <span
                  className="text-[10px] font-semibold text-text-muted tabular-nums"
                  title={task.tags!.map((t) => t.name).join(', ')}
                >
                  +{task.tags!.length - 2}
                </span>
              )}

              {fields.dueDate && task.dueDate && (
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    overdue ? 'text-danger' : 'text-text-muted'
                  }`}
                >
                  {dueLabel(task.dueDate)}
                </span>
              )}

              {fields.subtasks && checklist.progress !== null && (
                <span className="flex items-center gap-1.5 ml-auto shrink-0">
                  <span className="w-12 h-1.5 rounded-full bg-surface-hover overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-primary-600 transition-all duration-300 ease-in-out"
                      style={{ width: `${checklist.progress}%` }}
                    />
                  </span>
                  <span className="text-[10px] font-semibold text-text-muted tabular-nums">
                    {checklist.progress}%
                  </span>
                </span>
              )}
            </div>
          </div>
        </li>
      );
    })}
  </ul>
);

export const TaskListView = memo(TaskListViewComponent);
