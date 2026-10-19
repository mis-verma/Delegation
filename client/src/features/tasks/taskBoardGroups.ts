import { Columns3, Flag, Building2, Users, type LucideIcon } from 'lucide-react';
import { STATUS_LABEL, PRIORITY_MAP } from './taskDisplay';
import type { Task } from '../../api/task';

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
  key: string;
  label: string;
  tasks: Task[];
}

const STATUS_ORDER: Task['status'][] = ['todo', 'in_progress', 'on_hold', 'pending_approval', 'done'];
const PRIORITY_ORDER: Task['priority'][] = ['high', 'medium', 'low'];

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
    .sort((a, b) => {
      if (!a.key) return 1;
      if (!b.key) return -1;
      return a.label.localeCompare(b.label);
    });
};
