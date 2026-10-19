import { Columns3, Rows3, Table2, GanttChartSquare, type LucideIcon } from 'lucide-react';

export type TaskViewKey = 'board' | 'list' | 'table' | 'timeline';

export const TASK_VIEW_LABEL: Record<TaskViewKey, string> = {
  board: 'Board',
  list: 'List',
  table: 'Table',
  timeline: 'Timeline',
};

export const TASK_VIEW_ICON: Record<TaskViewKey, LucideIcon> = {
  board: Columns3,
  list: Rows3,
  table: Table2,
  timeline: GanttChartSquare,
};

export const TASK_VIEWS = Object.keys(TASK_VIEW_LABEL) as TaskViewKey[];

export const isTaskViewKey = (value: string | null): value is TaskViewKey =>
  !!value && (TASK_VIEWS as string[]).includes(value);

export const defaultTaskView = (isMobile: boolean): TaskViewKey => (isMobile ? 'list' : 'board');
