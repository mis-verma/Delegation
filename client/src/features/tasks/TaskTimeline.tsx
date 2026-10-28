import { memo, useMemo } from 'react';
import { useTaskStatusMove } from './useTaskStatusMove';
import { TaskMoveMenu } from './TaskMoveMenu';
import { PRIORITY_MAP } from './taskDisplay';
import { isOverdueTask } from './taskFilters';
import { taskAssigneeIds, type CardFieldVisibility } from './cardFields';
import type { Task } from '../../api/task';

interface TaskTimelineProps {
  tasks: Task[];
  assigneeNames: Map<string, string>;
  departmentNames?: Map<string, string>;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  fields: CardFieldVisibility;
  newlyAssignedTaskIds?: Set<string>;
}

const DAY_MS = 86_400_000;
const startOfDay = (value: string | Date) => new Date(value).setHours(0, 0, 0, 0);

const DAY_WIDTH_REM = 3.25;
const MIN_DAYS = 14;
const MAX_DAYS = 45;
const LEAD_DAYS = 3;

type Bar = {
  task: Task;
  offset: number;
  span: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

const TaskTimelineComponent = ({
  tasks,
  assigneeNames,
  onOpen,
  newlyAssignedTaskIds,
}: TaskTimelineProps) => {
  const { requestMove, statusRemarkDialog } = useTaskStatusMove();

  const { days, bars, undated } = useMemo(() => {
    const scheduled = tasks.filter((t) => !!t.dueDate);
    const unscheduled = tasks.filter((t) => !t.dueDate);

    if (scheduled.length === 0) {
      return { days: [] as Date[], bars: [] as Bar[], undated: unscheduled };
    }

    const barStart = (t: Task) => startOfDay(t.startDate ?? t.createdAt);
    const barEnd = (t: Task) => startOfDay(t.dueDate!);

    const today = startOfDay(new Date());
    let axisStart = Math.min(...scheduled.map(barStart), today - LEAD_DAYS * DAY_MS);
    const axisEnd = Math.max(...scheduled.map(barEnd), today + LEAD_DAYS * DAY_MS);

    let total = Math.max(MIN_DAYS, Math.floor((axisEnd - axisStart) / DAY_MS) + 1);
    if (total > MAX_DAYS) {
      axisStart = startOfDay(new Date()) - Math.min(7, MAX_DAYS - 1) * DAY_MS;
      total = MAX_DAYS;
    }

    const axisDays = Array.from({ length: total }, (_, i) => new Date(axisStart + i * DAY_MS));

    const placed: Bar[] = scheduled.map((task) => {
      const rawStart = barStart(task);
      const rawEnd = barEnd(task);
      const clampedStart = Math.max(rawStart, axisStart);
      const clampedEnd = Math.min(Math.max(rawEnd, clampedStart), axisStart + (total - 1) * DAY_MS);

      return {
        task,
        offset: Math.floor((clampedStart - axisStart) / DAY_MS),
        span: Math.floor((clampedEnd - clampedStart) / DAY_MS) + 1,
        clippedStart: rawStart < axisStart,
        clippedEnd: rawEnd > axisStart + (total - 1) * DAY_MS,
      };
    });

    return { days: axisDays, bars: placed, undated: unscheduled };
  }, [tasks]);

  const todayIndex = days.findIndex((d) => startOfDay(d) === startOfDay(new Date()));
  const chartWidth = `${days.length * DAY_WIDTH_REM}rem`;
  const dayCount = Math.max(days.length, 1);
  const ownerName = (task: Task) => {
    const [first] = taskAssigneeIds(task).map((id) => assigneeNames.get(id)).filter(Boolean);
    return first ?? 'Unassigned';
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {days.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap px-1">
            {(['high', 'medium', 'low'] as Task['priority'][]).map((key) => (
              <span key={key} className="flex items-center gap-1.5">
                <span aria-hidden className={`w-4 h-2.5 rounded-sm ${PRIORITY_MAP[key].bar}`} />
                <span className="t-meta font-semibold text-text-muted tracking-tight">
                  {PRIORITY_MAP[key].label}
                </span>
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-danger" />
              <span className="t-meta font-semibold text-text-muted tracking-tight">Overdue shows in red on the row</span>
            </span>
          </div>
        )}

        {days.length > 0 && (
          <div className="rounded-lg border border-border/60 bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <div className="w-full" style={{ minWidth: `calc(16rem + ${chartWidth})` }}>
                <div className="flex sticky top-0 z-20 bg-primary-800">
                  <div className="sticky left-0 z-30 w-52 md:w-64 shrink-0 px-3 py-2.5 bg-primary-800">
                    <span className="t-meta font-semibold text-white tracking-tight">Delegation</span>
                  </div>
                  <div className="flex flex-1" style={{ minWidth: chartWidth }}>
                    {days.map((day, index) => (
                      <div
                        key={day.toISOString()}
                        className={`flex-1 basis-0 px-1 py-2.5 text-center t-meta font-semibold tabular-nums ${
                          index === todayIndex ? 'text-white' : 'text-white/60'
                        }`}
                        style={{ minWidth: `${DAY_WIDTH_REM}rem` }}
                      >
                        {index === 0 || day.getDate() === 1
                          ? day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                          : day.getDate()}
                      </div>
                    ))}
                  </div>
                </div>

                <ul className="flex flex-col">
                  {bars.map(({ task, offset, span, clippedStart, clippedEnd }) => {
                    const priority = PRIORITY_MAP[task.priority];
                    const overdue = isOverdueTask(task);
                    const isNew = newlyAssignedTaskIds?.has(task.id);

                    return (
                      <li key={task.id} className="flex border-t border-border/40">
                        <div className="sticky left-0 z-10 w-52 md:w-64 shrink-0 flex items-center gap-2 px-3 py-2.5 bg-surface">
                          <span
                            aria-hidden
                            className={`w-1 self-stretch rounded-full shrink-0 ${priority.bar}`}
                          />
                          <button
                            type="button"
                            onClick={() => onOpen(task)}
                            className="flex flex-col min-w-0 text-left cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-all duration-200 ease-in-out"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              {isNew && (
                                <span
                                  className="size-1.5 rounded-full bg-primary-500 shrink-0"
                                  title="Newly assigned to you"
                                />
                              )}
                              <span className="t-meta font-semibold text-text-secondary tracking-tight truncate">
                                {task.title}
                              </span>
                            </span>
                            <span className="t-meta font-medium truncate">
                              {overdue ? (
                                <span className="text-danger font-semibold">Overdue</span>
                              ) : (
                                <span className="text-text-muted">{ownerName(task)}</span>
                              )}
                            </span>
                          </button>

                          <div className="ml-auto shrink-0">
                            <TaskMoveMenu task={task} onMove={requestMove} />
                          </div>
                        </div>

                        <div className="relative flex-1 py-3" style={{ minWidth: chartWidth }}>
                          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-5 flex">
                            {days.map((day, index) => (
                              <div
                                key={day.toISOString()}
                                className={`flex-1 basis-0 h-full ${
                                  index === todayIndex ? 'bg-primary-500/20' : 'bg-surface-hover/60'
                                }`}
                              />
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpen(task)}
                            title={`${task.title}, ${priority.label} priority${overdue ? ', overdue' : ''}${
                              clippedStart || clippedEnd ? '. Extends beyond the visible range.' : ''
                            }`}
                            className={`absolute top-1/2 -translate-y-1/2 h-5 ${priority.bar} cursor-pointer transition-all duration-200 ease-in-out hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
                              clippedStart ? '' : 'rounded-l-md'
                            } ${clippedEnd ? '' : 'rounded-r-md'}`}
                            style={{
                              left: `${(offset / dayCount) * 100}%`,
                              width: `${(span / dayCount) * 100}%`,
                            }}
                          >
                            <span className="sr-only">
                              {`Open ${task.title}, ${priority.label} priority, due ${new Date(task.dueDate!).toDateString()}`}
                            </span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}

        {undated.length > 0 && (
          <section className="flex flex-col gap-2">
            <header className="flex items-center gap-2">
              <h3 className="t-card font-display font-semibold text-text">No due date</h3>
              <span className="t-meta font-semibold text-text-muted tabular-nums">{undated.length}</span>
              <span className="flex-1 h-px bg-border/50" />
            </header>

            <ul className="flex flex-col rounded-lg border border-border/60 overflow-hidden">
              {undated.map((task) => (
                <li key={task.id} className="border-t border-border/40 first:border-t-0">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(task)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(task);
                      }
                    }}
                    className="relative flex items-center gap-3 pl-4 pr-3 py-2.5 bg-surface hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60 focus-visible:outline-none transition-colors duration-200 ease-in-out cursor-pointer"
                  >
                    <span
                      aria-hidden
                      className={`absolute left-0 top-0 bottom-0 w-1 ${PRIORITY_MAP[task.priority].bar}`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="t-meta font-semibold text-text-secondary tracking-tight truncate">
                        {task.title}
                      </span>
                      <span className="t-meta font-medium text-text-muted truncate">
                        {ownerName(task)}
                      </span>
                    </div>
                    <div className="ml-auto shrink-0">
                      <TaskMoveMenu task={task} onMove={requestMove} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {statusRemarkDialog}
    </>
  );
};

export const TaskTimeline = memo(TaskTimelineComponent);
