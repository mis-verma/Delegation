import { CalendarClock, Flag, Clock, ArrowDownAZ, type LucideIcon } from 'lucide-react';
import type { Task } from '../../api/task';

// "Issue" and "Delegation" are the two real category values on Task, but a plain task typed
// into the "New Task" form also lands in category "delegation" with no aiMeta at all — so from
// the user's point of view that's really a third bucket ("Direct Task") distinct from AI/WhatsApp
// delegations. These are UI-only filter keys, not stored values, split out via a lookup map
// (rather than if/else) so adding another bucket later is just one more entry here.
export type CategoryFilterKey = 'all' | 'issue' | 'delegation' | 'task';

export interface TaskFilters {
  category:     CategoryFilterKey;
  status:       Task['status'] | 'all';
  priority:     Task['priority'][];
  /**
   * A delegation has no store of its own — it hangs off a department, and the department is what
   * belongs to a store. So this filters on `department.storeId`, and a delegation with no
   * department is out of scope for any store, the same way it's out of scope for any department.
   */
  storeId:      string;
  departmentId: string;
  assigneeIds:  string[];
  raisedByIds:  string[];
  /**
   * Label ids, matched as OR — a delegation carrying ANY of them passes.
   *
   * Unlike every other filter here, this one is applied by the SERVER (it goes into the tasks
   * query key and the request). A client-side label filter would run over one already-truncated
   * page, so the stat tiles would report that page's tally rather than the real one.
   */
  tagIds:       string[];
}

/**
 * Statuses whose due date no longer runs. Done is finished, a draft hasn't gone out yet, and work
 * waiting for approval has been handed in, so the assignee's clock has stopped. On hold is NOT here:
 * pausing work doesn't move its deadline.
 *
 * The same set the server uses for its summary, scores and owner stats (task.service.ts and
 * score.service.ts), so a tile here and a number on the dashboard can't disagree.
 */
export const OVERDUE_EXEMPT_STATUSES: ReadonlySet<Task['status']> = new Set(['done', 'draft', 'pending_approval']);

/**
 * Past its due date and still running (see OVERDUE_EXEMPT_STATUSES).
 *
 * Was declared three times over — TaskList's quick-filter predicates, TaskBoard's per-column
 * count and TaskCard's own footer chip — in three slightly different shapes, one of which
 * returned `string | boolean | undefined` rather than a boolean. One definition, so a card can
 * never disagree with the column header counting it.
 */
export const isOverdueTask = (t: Task) =>
  !!t.dueDate && !OVERDUE_EXEMPT_STATUSES.has(t.status) && new Date(t.dueDate).getTime() < Date.now();

export const CATEGORY_PREDICATES: Record<CategoryFilterKey, (t: Task) => boolean> = {
  all: () => true,
  issue: (t) => t.category === 'issue',
  delegation: (t) => t.category === 'delegation' && !!t.aiMeta,
  task: (t) => t.category === 'delegation' && !t.aiMeta,
};

export type TaskSortKey = 'dueDate' | 'priority' | 'createdAt' | 'title';

export const SORT_LABEL: Record<TaskSortKey, string> = {
  dueDate: 'Due date',
  priority: 'Priority',
  createdAt: 'Created date',
  title: 'Title',
};

export const SORT_ICON: Record<TaskSortKey, LucideIcon> = {
  dueDate: CalendarClock,
  priority: Flag,
  createdAt: Clock,
  title: ArrowDownAZ,
};

const PRIORITY_RANK: Record<Task['priority'], number> = { 
  low: 0, 
  medium: 1, 
  high: 2 
};

// Tasks with no due date sort after every dated task, regardless of sort direction —
// "no deadline" isn't meaningfully earlier or later than a real date.
export const SORT_COMPARATORS: Record<TaskSortKey, (a: Task, b: Task) => number> = {
  dueDate: (a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  },
  priority: (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
  createdAt: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  title: (a, b) => a.title.localeCompare(b.title),
};