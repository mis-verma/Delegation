import { StatusFigureStats, type StatusFigureItem } from "../dashboard/StatusFigureStats";

export type QuickFilterKey = 'pending' | 'completed' | 'due' | 'delayed';

export interface QuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  delayed: number;
}

const ITEMS: readonly StatusFigureItem<QuickFilterKey>[] = [
  { key: 'pending', kind: 'pending', label: 'Pending', help: 'Delegations still open. Tap to show only these, tap again to show all.' },
  { key: 'completed', kind: 'completed', label: 'Completed', short: 'Done', help: 'Delegations that are finished. Tap to show only these, tap again to show all.' },
  { key: 'due', kind: 'due', label: 'Due', help: 'Delegations coming due. Tap to show only these, tap again to show all.' },
  { key: 'delayed', kind: 'late', label: 'Delayed', help: 'Delegations past their deadline. Tap to show only these, tap again to show all.' },
];

interface TaskQuickStatsProps {
  counts: QuickFilterCounts;
  total: number;
  active: QuickFilterKey | null;
  onToggle: (key: QuickFilterKey) => void;
  onClear?: () => void;
  isLoading?: boolean;
}

export const TaskQuickStats = ({ counts, total, active, onToggle, isLoading }: TaskQuickStatsProps) => (
  <StatusFigureStats items={ITEMS} counts={counts} total={total} active={active} onToggle={onToggle} isLoading={isLoading} label="Delegation figures" />
);
