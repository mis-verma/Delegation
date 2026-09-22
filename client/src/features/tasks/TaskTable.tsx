import { memo } from 'react';
import { StatusChip, PriorityChip, DepartmentChip, TagChip, IconChip, type StatusChipStatus } from '../../components';
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
  isVerifier: boolean;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  /** Same visibility the cards use — the Fields row governs columns here too. */
  fields: CardFieldVisibility;
  newlyAssignedTaskIds?: Set<string>;
}

// The status values Task uses aren't StatusChip's vocabulary (StatusChip is shared with tickets
// and checklists), so map rather than casting.
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
  isVerifier,
  onOpen,
  fields,
  newlyAssignedTaskIds,
}: TaskTableProps) => {
  const { requestMove, statusRemarkDialog } = useTaskStatusMove(isVerifier);

  return (
    <>
      <div className="w-full overflow-x-auto rounded-lg border border-border/60">
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
              {fields.department && <th scope="col" className={HEAD_CLASS}>Department</th>}
              <th scope="col" className={HEAD_CLASS}>Labels</th>
              {fields.raisedBy && <th scope="col" className={HEAD_CLASS}>Raised by</th>}
              {fields.dueDate && <th scope="col" className={HEAD_CLASS}>Due</th>}
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
                      <span className="font-semibold text-text-secondary truncate">{task.title}</span>
                    </div>
                  </td>

                  {fields.status && (
                    <td className={CELL_CLASS}>
                      <StatusChip status={STATUS_CHIP_KEY[task.status]} />
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
                        <span title={assignees.join(', ')}>
                          {assignees[0]}
                          {assignees.length > 1 && (
                            <span className="text-text-muted"> +{assignees.length - 1}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-light">Unassigned</span>
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
                      <div className="flex items-center gap-1 flex-wrap">
                        {task.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
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

                  {fields.dueDate && (
                    <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
                      {task.dueDate ? (
                        <span className={overdue ? 'text-danger font-semibold' : undefined}>
                          {formatShortDate(task.dueDate)}
                        </span>
                      ) : (
                        <span className="text-text-light">—</span>
                      )}
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
                      <TaskMoveMenu task={task} isVerifier={isVerifier} onMove={requestMove} />
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
