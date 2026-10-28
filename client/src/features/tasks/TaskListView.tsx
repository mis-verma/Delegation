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
import { getTaskChecklistProgress } from '../../lib/checklistProgress';
import type { Task } from '../../api/task';

interface TaskListViewProps {
  tasks: Task[];
  departmentNames?: Map<string, string>;
  assigneeNames?: Map<string, string>;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  fields: CardFieldVisibility;
  newlyAssignedTaskIds?: Set<string>;
}

const dueLabel = (iso: string, overdue: boolean) => {
  const startOfDay = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000);
  if (overdue && days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return formatShortDate(iso);
};

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
      const checklist = getTaskChecklistProgress(task);
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
            className="h-full flex flex-col gap-2 sm:gap-2 p-3 sm:p-3.5 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50 focus-visible:border-primary-500/50 focus-visible:outline-none active:bg-surface-hover/50 transition-all duration-200 ease-in-out cursor-pointer [-webkit-tap-highlight-color:transparent]"
          >
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                {isNew && (
                  <span
                    className="mt-1.5 size-2 rounded-full bg-primary-500 shrink-0"
                    title="Newly assigned to you"
                  />
                )}
                <span className="flex-1 min-w-0 t-card font-display font-semibold text-text tracking-tight leading-snug line-clamp-2 break-words">
                  {task.title}
                </span>
                {fields.assignee && (
                  <span className="flex items-center -space-x-1.5 shrink-0" title={owners.length ? owners.join(', ') : 'Unassigned'}>
                    {owners.length ? (
                      <>
                        {owners.slice(0, 3).map((name, i) => (
                          <span key={name + i} className={`flex items-center justify-center size-7 rounded-full ring-2 ring-surface text-white t-meta font-bold ${avatarColorClass(name)}`}>
                            {getInitials(name)}
                          </span>
                        ))}
                        {owners.length > 3 && (
                          <span className="flex items-center justify-center size-7 rounded-full ring-2 ring-surface bg-surface-hover text-text-secondary t-meta font-bold">
                            +{owners.length - 3}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="flex items-center justify-center size-7 rounded-full border border-border-hover text-text-light t-meta font-bold">?</span>
                    )}
                  </span>
                )}
              </div>
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

            <div className="flex items-center gap-1.5 flex-wrap mt-auto">
              {fields.status && <TaskStatusChip status={task.status} declined={!!task.declinedAt} />}

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
