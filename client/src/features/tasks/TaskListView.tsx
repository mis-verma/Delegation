import { memo } from 'react';
import { CalendarDays } from 'lucide-react';
import { DepartmentChip, TagChip, PriorityChip, IconChip } from '../../components';
import { TaskStatusChip } from './TaskStatusChip';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import { PRIORITY_MAP } from './taskDisplay';
import { isOverdueTask } from './taskFilters';
import {
  subtaskProgress,
  taskAssigneeIds,
  formatShortDate,
  CATEGORY_CONFIG,
  type CardFieldVisibility,
} from './cardFields';
import { getChecklistProgress } from '../../lib/checklistProgress';
import type { Task } from '../../api/task';

interface TaskListViewProps {
  tasks: Task[];
  departmentNames?: Map<string, string>;
  /** id -> display name, for the owner avatars on each tile. */
  assigneeNames?: Map<string, string>;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  fields: CardFieldVisibility;
  newlyAssignedTaskIds?: Set<string>;
}

// "Today" and "Tomorrow" beat a date the reader has to compare against today's, which is the whole
// job of a due value. Anything further out is the plain short date.
// Overdue says by how much ("14d overdue"), the same wording the Board card uses, rather than a
// bare past date the reader has to subtract from today.
const dueLabel = (iso: string, overdue: boolean) => {
  const startOfDay = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000);
  if (overdue && days < 0) return `${Math.abs(days)}d overdue`;
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
 * The owner is a small avatar stack beside the title (governed by the Assignee field toggle), not
 * a spelled-out name — enough to spot "mine" at a glance without spending the tile's width on it.
 *
 * No "Move to" menu either: status changes from this view go through the tile's detail sheet, which
 * enforces the same remark gate. Board and Timeline keep their inline menus.
 */
const TaskListViewComponent = ({
  tasks,
  departmentNames,
  assigneeNames,
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
      const owners = taskAssigneeIds(task)
        .map((id) => assigneeNames?.get(id))
        .filter((n): n is string => !!n);

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
            // No colored side stripe and no date pinned to the right edge any more: priority and
            // due date are chips in the row below, in the same icon-chip language as status and
            // department — one place to read every property instead of three.
            className="h-full flex flex-col gap-2 sm:gap-2.5 p-3 sm:p-3.5 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50 focus-visible:border-primary-500/50 focus-visible:outline-none active:bg-surface-hover/50 transition-all duration-200 ease-in-out cursor-pointer [-webkit-tap-highlight-color:transparent]"
          >
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                {isNew && (
                  <span
                    className="mt-1.5 size-2 rounded-full bg-primary-500 shrink-0"
                    title="Newly assigned to you"
                  />
                )}
                {/* No truncate — this was cutting titles down to a handful of words ("Security
                    camera offline since ...") on a narrow phone card. Two lines, then an ellipsis. */}
                <span className="flex-1 min-w-0 t-card font-display font-semibold text-text tracking-tight leading-snug line-clamp-2 break-words">
                  {task.title}
                </span>
                {/* Who owns it, as a small avatar stack — a glance answers "is this mine?" without
                    opening the tile. Up to three faces, then +n. */}
                {fields.assignee && (
                  <span className="flex items-center -space-x-1.5 shrink-0" title={owners.length ? owners.join(', ') : 'Unassigned'}>
                    {owners.length ? (
                      <>
                        {owners.slice(0, 3).map((name, i) => (
                          <span key={name + i} className={`flex items-center justify-center size-7 rounded-full ring-2 ring-surface text-white text-xs font-bold ${avatarColorClass(name)}`}>
                            {getInitials(name)}
                          </span>
                        ))}
                        {owners.length > 3 && (
                          <span className="flex items-center justify-center size-7 rounded-full ring-2 ring-surface bg-surface-hover text-text-secondary text-xs font-bold">
                            +{owners.length - 3}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="flex items-center justify-center size-7 rounded-full border border-border-hover text-text-light text-xs font-bold">?</span>
                    )}
                  </span>
                )}
              </div>
              {/* The reference layout also puts a task code and a comment count on this line.
                  Neither exists yet: ids are cuids with no short human code, and the list payload
                  carries no comment count. Type and checklist progress are real data. */}
              {/* Every tile here is a delegation, so saying "Delegation" on each one told nobody anything.
                  The type shows only for the odd one that is an Issue. On a phone the department rides
                  on this line (its chip is hidden there), so the tile stays short but still says where
                  it belongs. */}
              {(task.category !== 'delegation' || progress || (fields.department && department)) && (
                <div className="flex items-center min-w-0 whitespace-nowrap t-meta font-medium text-text-muted">
                  {task.category !== 'delegation' && <span className="shrink-0">{CATEGORY_CONFIG[task.category].label}</span>}
                  {progress && (
                    <span className="tabular-nums shrink-0">
                      {task.category !== 'delegation' && ', '}Checklist {progress.done}/{progress.total}
                    </span>
                  )}
                  {fields.department && department && (
                    <span className="sm:hidden min-w-0 truncate">
                      {(task.category !== 'delegation' || progress) && ', '}
                      {department}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* mt-auto so tiles of differing title length still align their footers to the bottom
                of the row — a two-up grid stretches its cells to equal height. */}
            <div className="flex items-center gap-1.5 flex-wrap mt-auto">
              {fields.status && <TaskStatusChip status={task.status} />}

              <PriorityChip meta={priority} />

              {fields.department && department && <DepartmentChip name={department} className="hidden sm:inline-flex" />}

              {fields.dueDate && task.dueDate && (
                <IconChip
                  icon={CalendarDays}
                  tone={overdue ? 'bg-danger' : 'bg-primary-700'}
                  label={dueLabel(task.dueDate, overdue)}
                  title={overdue ? 'Overdue' : 'Due date'}
                  className={overdue ? 'border-danger/30 text-danger' : undefined}
                />
              )}

              {/* Capped at two with a +n overflow: a delegation carrying six labels would
                  otherwise push status and due date off the tile entirely. */}
              {task.tags?.slice(0, 2).map((tag) => <TagChip key={tag.id} tag={tag} className="hidden sm:inline-flex" />)}
              {(task.tags?.length ?? 0) > 2 && (
                <span
                  className="hidden sm:inline t-meta font-semibold text-text-muted tabular-nums"
                  title={task.tags!.map((t) => t.name).join(', ')}
                >
                  +{task.tags!.length - 2}
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
                  <span className="t-meta font-semibold text-text-muted tabular-nums">
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
