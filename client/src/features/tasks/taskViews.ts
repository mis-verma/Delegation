import { Columns3, Rows3, Table2, GanttChartSquare, type LucideIcon } from 'lucide-react';

/**
 * How the same filtered delegations are laid out.
 *
 * Until now this wasn't a choice at all — the viewport decided it, mobile getting a stack of cards
 * grouped by status and everything else getting TaskBoard, so a phone could never see a board and
 * a desktop could never see a plain list. The four views are lenses over one already-filtered,
 * already-sorted array; none of them fetches anything of its own.
 *
 * Only Board reacts to "Group board by" (columns are its whole structure). List and Table follow
 * the toolbar's sort. Timeline ignores it and lays bars out on a date axis, which is why the sort
 * control hides in that view.
 */
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

/**
 * Board columns need real width to be readable — four to five of them on a phone means a card
 * roughly 40px wide, which is why the viewport used to force the list. So the *default* is still
 * per-viewport, but it's only a default now: pick Board on a phone and you get the board, with
 * TaskBoard's own horizontal snap-scroll carrying it.
 */
export const defaultTaskView = (isMobile: boolean): TaskViewKey => (isMobile ? 'list' : 'board');
