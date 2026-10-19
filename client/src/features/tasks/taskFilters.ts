import { CalendarClock, Flag, Clock, ArrowDownAZ, type LucideIcon } from 'lucide-react';
import type { Task } from '../../api/task';

export type CategoryFilterKey = 'all' | 'issue' | 'delegation' | 'task';

export interface TaskFilters {
  category:     CategoryFilterKey;
  status:       Task['status'] | 'all';
  priority:     Task['priority'][];
  storeId:      string;
  departmentId: string;
  assigneeIds:  string[];
  raisedByIds:  string[];
  tagIds:       string[];
}

export const OVERDUE_EXEMPT_STATUSES: ReadonlySet<Task['status']> = new Set(['done', 'draft', 'pending_approval']);

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