import { ArrowDownWideNarrow, CalendarClock, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Todo, TodoPriority } from '../../api/todos';

export type TodoSortKey = 'due' | 'priority' | 'created';

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
      return sorted.sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (time(a.dueDate) ?? Infinity) - (time(b.dueDate) ?? Infinity),
      );
    case 'created':
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
};
