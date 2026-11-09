import { memo } from 'react';
import { CalendarDays } from 'lucide-react';
import { PriorityChip, DepartmentChip, TagChip, IconChip } from '../../components';
import { TaskStatusChip } from './TaskStatusChip';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import { TaskMoveMenu } from './TaskMoveMenu';
import { useTaskStatusMove } from './useTaskStatusMove';
import { PRIORITY_MAP } from './taskDisplay';
import { cn } from '@/lib/utils';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, NUM_CLASS, FIRST_COL_WIDTH_CLASS, activateOnKey } from '../../components/dataTable';
import { isOverdueTask } from './taskFilters';
import {
  taskAssigneeIds,
  subtaskProgress,
  formatShortDate,
  formatShortDateTime,
  CATEGORY_CONFIG,
  type CardFieldVisibility,
} from './cardFields';
import type { Task } from '../../api/task';

interface TaskTableProps {
  tasks: Task[];
  assigneeNames: Map<string, string>;
  departmentNames?: Map<string, string>;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  fields: CardFieldVisibility;
  newlyAssignedTaskIds?: Set<string>;
}

const dueText = (iso: string, overdue: boolean) => {
  const days = Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (overdue && days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return formatShortDate(iso);
};

const MAX_TABLE_LABELS = 2;

const HEAD_CLASS = TH_CLASS;
const CELL_CLASS = TD_CLASS;

const namesFor = (task: Task, assigneeNames: Map<string, string>) =>
  taskAssigneeIds(task)
    .map((id) => assigneeNames.get(id))
    .filter((n): n is string => !!n);

const TaskTableComponent = ({
  tasks,
  assigneeNames,
  departmentNames,
  onOpen,
  fields,
  newlyAssignedTaskIds,
}: TaskTableProps) => {
  const { requestMove, statusRemarkDialog } = useTaskStatusMove();

  return (
    <>
      <div className={TABLE_FRAME_CLASS}>
        <table className="w-full min-w-[52rem] border-collapse">
          <caption className="sr-only">Delegations</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(HEAD_CLASS, TH_CORNER_CLASS)}>
                Delegation
              </th>
              {fields.status && <th scope="col" className={HEAD_CLASS}>Status</th>}
              {fields.priority && <th scope="col" className={HEAD_CLASS}>Priority</th>}
              {fields.category && <th scope="col" className={HEAD_CLASS}>Category</th>}
              {fields.assignee && <th scope="col" className={HEAD_CLASS}>Assignee</th>}
              {fields.dueDate && <th scope="col" className={HEAD_CLASS}>Due</th>}
              {fields.department && <th scope="col" className={HEAD_CLASS}>Department</th>}
              <th scope="col" className={HEAD_CLASS}>Labels</th>
              {fields.raisedBy && <th scope="col" className={HEAD_CLASS}>Raised by</th>}
              {fields.subtasks && <th scope="col" className={cn(HEAD_CLASS, 'text-right')}>Subtasks</th>}
              {fields.created && <th scope="col" className={HEAD_CLASS}>Created</th>}
              {fields.updated && <th scope="col" className={HEAD_CLASS}>Updated</th>}
              <th scope="col" className={cn(HEAD_CLASS, 'text-right')}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const overdue = isOverdueTask(task);
              const progress = subtaskProgress(task);
              const assignees = namesFor(task, assigneeNames);
              const department = task.departmentId ? departmentNames?.get(task.departmentId) : undefined;
              const raisedBy = assigneeNames.get(task.userId);
              const isNew = newlyAssignedTaskIds?.has(task.id);

              return (
                <tr
                  key={task.id}
                  onClick={() => onOpen(task)}
                  tabIndex={0}
                  onKeyDown={activateOnKey(() => onOpen(task))}
                  className={TR_CLASS}
                >
                  <td className={cn(CELL_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS)}>
                    <div className="flex items-center gap-2">
                      {isNew && (
                        <span
                          className="size-1.5 rounded-full bg-primary-500 shrink-0"
                          title="Newly assigned to you"
                        />
                      )}
                      <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug break-words min-w-0" title={task.title}>{task.title}</span>
                    </div>
                  </td>

                  {fields.status && (
                    <td className={CELL_CLASS}>
                      <TaskStatusChip status={task.status} declined={!!task.declinedAt} />
                    </td>
                  )}

                  {fields.priority && (
                    <td className={CELL_CLASS}>
                      <PriorityChip meta={PRIORITY_MAP[task.priority]} />
                    </td>
                  )}

                  {fields.category && (
                    <td className={CELL_CLASS}>
                      <IconChip icon={CATEGORY_CONFIG[task.category].icon} tone={CATEGORY_CONFIG[task.category].solid} label={CATEGORY_CONFIG[task.category].label} />
                    </td>
                  )}

                  {fields.assignee && (
                    <td className={`${CELL_CLASS} whitespace-nowrap`}>
                      {assignees.length ? (
                        <span className="inline-flex items-center gap-2" title={assignees.join(', ')}>
                          <span className={`flex items-center justify-center size-7 rounded-full text-white t-meta font-bold shrink-0 ${avatarColorClass(assignees[0])}`}>
                            {getInitials(assignees[0])}
                          </span>
                          <span className="font-medium text-text">{assignees[0]}</span>
                          {assignees.length > 1 && (
                            <span className="t-meta font-bold px-1.5 py-px rounded-full bg-surface-hover text-text-secondary">+{assignees.length - 1}</span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-text-light">
                          <span className="size-6 rounded-full border border-border-hover shrink-0" aria-hidden />
                          Unassigned
                        </span>
                      )}
                    </td>
                  )}

                  {fields.dueDate && (
                    <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
                      {task.dueDate ? (
                        <IconChip
                          icon={CalendarDays}
                          tone={overdue ? 'bg-danger' : 'bg-primary-700'}
                          label={dueText(task.dueDate, overdue)}
                          className={overdue ? 'border-danger/30 text-danger' : undefined}
                        />
                      ) : (
                        <span className="text-text-light">None</span>
                      )}
                    </td>
                  )}

                  {fields.department && (
                    <td className={CELL_CLASS}>
                      {department ? <DepartmentChip name={department} /> : <span className="text-text-light">None</span>}
                    </td>
                  )}

                  <td className={CELL_CLASS}>
                    {task.tags?.length ? (
                      <div className="flex items-center gap-1 flex-nowrap" title={task.tags.map((t) => t.name).join(', ')}>
                        {task.tags.slice(0, MAX_TABLE_LABELS).map((tag) => <TagChip key={tag.id} tag={tag} />)}
                        {task.tags.length > MAX_TABLE_LABELS && (
                          <span className="t-meta font-bold px-1.5 py-px rounded-full bg-surface-hover text-text-secondary tabular-nums">+{task.tags.length - MAX_TABLE_LABELS}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-light">None</span>
                    )}
                  </td>

                  {fields.raisedBy && (
                    <td className={`${CELL_CLASS} whitespace-nowrap`}>
                      {raisedBy ?? <span className="text-text-light">None</span>}
                    </td>
                  )}

                  {fields.subtasks && (
                    <td className={cn(CELL_CLASS, 'whitespace-nowrap', NUM_CLASS)}>
                      {progress ? `${progress.done}/${progress.total}` : <span className="text-text-light">None</span>}
                    </td>
                  )}

                  {fields.created && (
                    <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums text-text-muted`}>
                      {formatShortDateTime(task.createdAt)}
                    </td>
                  )}

                  {fields.updated && (
                    <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums text-text-muted`}>
                      {formatShortDateTime(task.updatedAt)}
                    </td>
                  )}

                  <td className={`${CELL_CLASS} text-right`}>
                    <div className="flex items-center justify-end">
                      <TaskMoveMenu task={task} onMove={requestMove} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {statusRemarkDialog}

      <p className="sr-only" aria-live="polite">
        {tasks.length} {tasks.length === 1 ? 'delegation' : 'delegations'} shown.
      </p>
    </>
  );
};

export const TaskTable = memo(TaskTableComponent);
