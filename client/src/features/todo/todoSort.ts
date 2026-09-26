import { ArrowDownWideNarrow, CalendarClock, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Todo, TodoPriority } from '../../api/todos';

export type TodoSortKey = 'due' | 'priority' | 'created';

/** Ordering follows the label order, same convention as the Delegation/Tickets sort menus. */
export const TODO_SORT_LABEL: Record<TodoSortKey, string> = {
  due: 'Due date',
  priority: 'Priority',
  created: 'Newest first',
};

export const TODO_SORT_ICON: Record<TodoSortKey, LucideIcon> = {
  due: CalendarClock,
  priority: ArrowDownWideNarrow,
  created: Clock,
};

export type TodoPriorityFilter = 'all' | TodoPriority;

const PRIORITY_RANK: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

/**
 * Sorts a copy — callers pass React Query's cached array, which must not be mutated in place.
 *
 * "Due date" puts the soonest first and sinks undated todos to the bottom rather than treating a
 * missing date as the epoch (which would have floated every undated item to the top, the opposite
 * of what picking this sort means).
 */
export const sortTodos = (todos: Todo[], sort: TodoSortKey): Todo[] => {
  const sorted = [...todos];

  switch (sort) {
    case 'due':
      return sorted.sort((a, b) => {
        const at = time(a.dueDate);
        const bt = time(b.dueDate);
        if (at === null && bt === null) return 0;
        if (at === null) return 1;
        if (bt === null) return -1;
        return at - bt;
      });
    case 'priority':
      // Ties break on due date so the high-priority block isn't itself in arbitrary order.
      return sorted.sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (time(a.dueDate) ?? Infinity) - (time(b.dueDate) ?? Infinity),
      );
    case 'created':
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
};
