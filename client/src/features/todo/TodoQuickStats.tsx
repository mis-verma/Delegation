import { StatusFigureStats, type StatusFigureItem } from '../dashboard/StatusFigureStats';

export type TodoQuickFilterKey = 'pending' | 'completed' | 'due' | 'delayed';

export interface TodoQuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  delayed: number;
}

const ITEMS: readonly StatusFigureItem<TodoQuickFilterKey>[] = [
  { key: 'pending', kind: 'pending', label: 'Pending', help: 'To-dos still open. Tap to show only these, tap again to show all.' },
  { key: 'completed', kind: 'completed', label: 'Completed', short: 'Done', help: 'To-dos that are finished. Tap to show only these, tap again to show all.' },
  { key: 'due', kind: 'due', label: 'Due', help: 'To-dos coming due. Tap to show only these, tap again to show all.' },
  { key: 'delayed', kind: 'late', label: 'Delayed', help: 'To-dos past their due date. Tap to show only these, tap again to show all.' },
];

interface TodoQuickStatsProps {
  counts: TodoQuickFilterCounts;
  total: number;
  active: TodoQuickFilterKey | null;
  onToggle: (key: TodoQuickFilterKey) => void;
  onClear?: () => void;
  isLoading?: boolean;
}

export const TodoQuickStats = ({ counts, total, active, onToggle, isLoading }: TodoQuickStatsProps) => (
  <StatusFigureStats items={ITEMS} counts={counts} total={total} active={active} onToggle={onToggle} isLoading={isLoading} label="To-do figures" />
);
