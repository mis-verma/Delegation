import type { Todo } from '../../api/todos';
import type { TodoQuickFilterKey } from './TodoQuickStats';

export const isOverdueTodo = (t: Todo) => !!t.dueDate && !t.completed && new Date(t.dueDate).getTime() < Date.now();

export const TODO_QUICK_FILTER_PREDICATES: Record<TodoQuickFilterKey, (t: Todo) => boolean> = {
  pending: (t) => !t.completed,
  completed: (t) => t.completed,
  due: (t) => !!t.dueDate && !t.completed && !isOverdueTodo(t),
  delayed: isOverdueTodo,
};

const FILTER_KEYS = Object.keys(TODO_QUICK_FILTER_PREDICATES) as TodoQuickFilterKey[];

export const countTodosByFilter = (todos: readonly Todo[]): Record<TodoQuickFilterKey, number> => {
  const counts: Record<TodoQuickFilterKey, number> = { pending: 0, completed: 0, due: 0, delayed: 0 };
  for (const todo of todos) {
    for (const key of FILTER_KEYS) if (TODO_QUICK_FILTER_PREDICATES[key](todo)) counts[key] += 1;
  }
  return counts;
};
