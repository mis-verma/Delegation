import type { Todo } from '../../api/todos';
import { isOverdueTodo } from './todoQuickFilters';

export type TodoDueBucket = 'overdue' | 'today' | 'tomorrow' | 'later' | 'none';

export const TODO_BUCKET_LABEL: Record<TodoDueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  later: 'Later',
  none: 'No due date',
};

const BUCKET_ORDER: TodoDueBucket[] = ['overdue', 'today', 'tomorrow', 'later', 'none'];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const dueBucketOf = (todo: Todo, now: Date = new Date()): TodoDueBucket => {
  if (!todo.dueDate) return 'none';
  if (isOverdueTodo(todo)) return 'overdue';
  const due = new Date(todo.dueDate);
  if (isSameDay(due, now)) return 'today';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(due, tomorrow) ? 'tomorrow' : 'later';
};

export interface TodoGroup {
  key: TodoDueBucket;
  label: string;
  todos: Todo[];
}

export const groupTodosByDue = (todos: Todo[], now: Date = new Date()): TodoGroup[] => {
  const buckets = new Map<TodoDueBucket, Todo[]>();
  for (const todo of todos) {
    const key = dueBucketOf(todo, now);
    buckets.set(key, [...(buckets.get(key) ?? []), todo]);
  }
  return BUCKET_ORDER.flatMap((key) => {
    const list = buckets.get(key);
    return list ? [{ key, label: TODO_BUCKET_LABEL[key], todos: list }] : [];
  });
};
