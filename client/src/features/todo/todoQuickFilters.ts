import type { Todo } from '../../api/todos';
import type { TodoQuickFilterKey } from './TodoQuickStats';

export const isOverdueTodo = (t: Todo) => !!t.dueDate && !t.completed && new Date(t.dueDate).getTime() < Date.now();

export const TODO_QUICK_FILTER_PREDICATES: Record<TodoQuickFilterKey, (t: Todo) => boolean> = {
  pending: (t) => !t.completed,
  completed: (t) => t.completed,
  due: (t) => !!t.dueDate && !t.completed && !isOverdueTodo(t),
  delayed: isOverdueTodo,
};