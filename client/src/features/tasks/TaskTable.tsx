import { memo } from 'react';
import { CalendarDays } from 'lucide-react';
import { PriorityChip, DepartmentChip, TagChip, IconChip } from '../../components';
import { TaskStatusChip } from './TaskStatusChip';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import { TaskMoveMenu } from './TaskMoveMenu';
import { useTaskStatusMove } from './useTaskStatusMove';
import { PRIORITY_MAP, STATUS_LABEL } from './taskDisplay';
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
  /** Same visibility the cards use — the Fields row governs columns here too. */
  fields: CardFieldVisibility;
  newlyAssignedTaskIds?: Set<string>;
}

// Overdue reads as "14d overdue" (same wording as the cards), anything else as the short date.
const dueText = (iso: string, overdue: boolean) => {
  const days = Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (overdue && days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return formatShortDate(iso);
};

const MAX_TABLE_LABELS = 2;

// Solid navy header rather than a tinted surface row: it anchors the top of a dense grid and
// reads as a header at a glance even when the table is scrolled horizontally away from the
// sticky title column. Same treatment on every table in the product.
const HEAD_ROW_CLASS = 'bg-primary-800';
const HEAD_CLASS =
  'px-3 py-3 text-left text-xs font-semibold text-white tracking-tight whitespace-nowrap';
const CELL_CLASS = 'px-3 py-2.5 align-middle text-xs text-text-secondary';

const namesFor = (task: Task, assigneeNames: Map<string, string>) =>
  taskAssigneeIds(task)
    .map((id) => assigneeNames.get(id))
    .filter((n): n is string => !!n);

/**
 * Dense tabular view of the same delegations the board and list render.
 *
 * Earns its place next to them by being the only view where one row is one line: 40 delegations
 * are comparable at a glance across status, assignee and due date, which is what the board's
 * columns and the list's stacked cards can't do. It fetches nothing of its own and applies no
 * filtering — `tasks` arrives already scoped, filtered and sorted by TaskList.
 *
 * Columns follow the same `fields` visibility as the cards, so the "Customize cards" control in
 * Options governs this view too rather than the table inventing a second column picker.
 *
 * A table is inherently wider than a phone, so the scroll lives on this component's own container
 * (never the page body) and the title column stays sticky so a horizontally scrolled row is still
 * identifiable.
 */
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
      <div className="w-full overflow-x-auto rounded-lg border border-border/60 bg-surface">
        <table className="w-full min-w-[52rem] border-collapse">
          <thead className={HEAD_ROW_CLASS}>
            <tr>
              <th scope="col" className={`${HEAD_CLASS} sticky left-0 ${HEAD_ROW_CLASS} z-10`}>
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
              {fields.subtasks && <th scope="col" className={HEAD_CLASS}>Subtasks</th>}
              {fields.created && <th scope="col" className={HEAD_CLASS}>Created</th>}
              {fields.updated && <th scope="col" className={HEAD_CLASS}>Updated</th>}
              <th scope="col" className={`${HEAD_CLASS} text-right`}>
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(task);
                    }
                  }}
                  className="border-b border-border/40 last:border-b-0 hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60 focus-visible:outline-none transition-colors duration-200 ease-in-out cursor-pointer"
                >
                  <td className={`${CELL_CLASS} sticky left-0 bg-surface z-10 max-w-[22rem]`}>
                    <div className="flex items-center gap-2">
                      {isNew && (
                        <span
                          className="size-1.5 rounded-full bg-primary-500 shrink-0"
                          title="Newly assigned to you"
                        />
                      )}
                      <span className="font-display font-semibold text-sm text-text truncate" title={task.title}>{task.title}</span>
                    </div>
                  </td>

                  {fields.status && (
                    <td className={CELL_CLASS}>
                      <TaskStatusChip status={task.status} />
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
                          <span className={`flex items-center justify-center size-6 rounded-full text-white text-[9px] font-bold shrink-0 ${avatarColorClass(assignees[0])}`}>
                            {getInitials(assignees[0])}
                          </span>
                          <span className="font-medium text-text">{assignees[0]}</span>
                          {assignees.length > 1 && (
                            <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-surface-hover text-text-secondary">+{assignees.length - 1}</span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-text-light">
                          <span className="size-6 rounded-full border border-dashed border-border-hover shrink-0" aria-hidden />
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
                        <span className="text-text-light">—</span>
                      )}
                    </td>
                  )}

                  {fields.department && (
                    <td className={CELL_CLASS}>
                      {department ? <DepartmentChip name={department} /> : <span className="text-text-light">—</span>}
                    </td>
                  )}

                  {/* Not behind a `fields` flag: labels have no equivalent entry in the card-field
                      picker, and this is the one view wide enough to show a full set of them. */}
                  <td className={CELL_CLASS}>
                    {task.tags?.length ? (
                      <div className="flex items-center gap-1 flex-nowrap" title={task.tags.map((t) => t.name).join(', ')}>
                        {task.tags.slice(0, MAX_TABLE_LABELS).map((tag) => <TagChip key={tag.id} tag={tag} />)}
                        {task.tags.length > MAX_TABLE_LABELS && (
                          <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-surface-hover text-text-secondary tabular-nums">+{task.tags.length - MAX_TABLE_LABELS}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>

                  {fields.raisedBy && (
                    <td className={`${CELL_CLASS} whitespace-nowrap`}>
                      {raisedBy ?? <span className="text-text-light">—</span>}
                    </td>
                  )}

                  {fields.subtasks && (
                    <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
                      {progress ? `${progress.done}/${progress.total}` : <span className="text-text-light">—</span>}
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

      {/* Rendered here for the same reason the board and list do it: useTaskStatusMove hands back
          the gate as a node so a surface can't offer the move UI and skip the remark dialog. */}
      {statusRemarkDialog}

      <p className="sr-only" aria-live="polite">
        {tasks.length} delegations, sorted. Statuses: {Object.values(STATUS_LABEL).join(', ')}.
      </p>
    </>
  );
};

export const TaskTable = memo(TaskTableComponent);
