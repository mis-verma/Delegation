import { CalendarDays, CalendarClock, CheckCircle2, CircleDot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { StatusVariant } from '../../components';
import type { Todo } from '../../api/todos';
import { dueBucketOf } from './todoGroups';
import { isOverdueTodo } from './todoQuickFilters';

export type TodoStatusKey = 'done' | 'overdue' | 'today' | 'open';

interface TodoStatusMeta {
  label: string;
  variant: StatusVariant;
  icon: LucideIcon;
}

export const TODO_STATUS_META: Record<TodoStatusKey, TodoStatusMeta> = {
  done: { label: 'Done', variant: 'success', icon: CheckCircle2 },
  overdue: { label: 'Overdue', variant: 'critical', icon: CalendarClock },
  today: { label: 'Due today', variant: 'warning', icon: CalendarDays },
  open: { label: 'Open', variant: 'neutral', icon: CircleDot },
};

const STATUS_RULES: readonly (readonly [TodoStatusKey, (t: Todo) => boolean])[] = [
  ['done', (t) => t.completed],
  ['overdue', isOverdueTodo],
  ['today', (t) => dueBucketOf(t) === 'today'],
];

export const todoStatusOf = (todo: Todo): TodoStatusKey => STATUS_RULES.find(([, matches]) => matches(todo))?.[0] ?? 'open';
