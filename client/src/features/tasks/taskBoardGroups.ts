import { Columns3, Flag, Building2, Users, type LucideIcon } from 'lucide-react';
import { STATUS_LABEL, PRIORITY_MAP } from './taskDisplay';
import type { Task } from '../../api/task';

/**
 * What the board's columns represent.
 *
 * Status is the default and the only grouping a card can be *dragged* between: dropping a card on
 * a status column means "change its status", which is a real, reversible, audited action the
 * server already understands. The other three are read-only lenses on the same delegations —
 * dropping a card on a department column would have to mean "reassign this to that department",
 * which is a different decision with different consequences, so those boards don't accept drops.
 * The card's own status menu still works in every grouping, so nothing is unreachable.
 */
export type BoardGroupBy = 'status' | 'priority' | 'department' | 'assignee';

export const BOARD_GROUP_LABEL: Record<BoardGroupBy, string> = {
  status: 'Status',
  priority: 'Priority',
  department: 'Department',
  assignee: 'Assignee',
};

export const BOARD_GROUP_ICON: Record<BoardGroupBy, LucideIcon> = {
  status: Columns3,
  priority: Flag,
  department: Building2,
  assignee: Users,
};

export interface BoardColumn {
  /** Droppable id. Only meaningful as a drop target when grouping by status. */
  key: string;
  label: string;
  tasks: Task[];
}

const STATUS_ORDER: Task['status'][] = ['todo', 'in_progress', 'pending_approval', 'done'];
const PRIORITY_ORDER: Task['priority'][] = ['high', 'medium', 'low'];

/**
 * Groups by whichever key the caller asked for.
 *
 * Status and Priority use fixed column sets so an empty bucket still renders — a Priority board
 * with no "High" column would read as "nothing is urgent" when it actually means "nothing is
 * urgent *right now*", and the column is also where you'd drop something to make it urgent.
 * Department and Assignee are open-ended, so those columns come from the data and a bucket with
 * nothing in it simply isn't a column.
 */
export const buildBoardColumns = (
  tasks: Task[],
  groupBy: BoardGroupBy,
  departmentNames?: Map<string, string>,
  assigneeNames?: Map<string, string>,
): BoardColumn[] => {
  if (groupBy === 'status') {
    return STATUS_ORDER.map(status => ({
      key: status,
      label: STATUS_LABEL[status],
      tasks: tasks.filter(t => t.status === status),
    }));
  }

  if (groupBy === 'priority') {
    return PRIORITY_ORDER.map(priority => ({
      key: priority,
      label: PRIORITY_MAP[priority].label,
      tasks: tasks.filter(t => t.priority === priority),
    }));
  }

  // A delegation can carry several assignees; grouping puts it under its primary one only, so a
  // card appears exactly once on the board. The extra assignees are still on the card's avatar
  // row — a card that showed up in three columns would make every column count a lie.
  const keyOf = (t: Task) =>
    groupBy === 'department' ? t.departmentId ?? '' : t.assigneeId ?? '';

  const labelOf = (key: string) => {
    if (!key) return groupBy === 'department' ? 'No department' : 'Unassigned';
    const name = groupBy === 'department' ? departmentNames?.get(key) : assigneeNames?.get(key);
    return name ?? 'Unknown';
  };

  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = keyOf(task);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }

  return [...buckets.entries()]
    .map(([key, bucketTasks]) => ({ key, label: labelOf(key), tasks: bucketTasks }))
    // Named buckets alphabetically, with the "none" bucket pinned last — it's the leftovers, and
    // sorting it in by its label would drop it under N for "No department" and U for "Unassigned".
    .sort((a, b) => {
      if (!a.key) return 1;
      if (!b.key) return -1;
      return a.label.localeCompare(b.label);
    });
};
