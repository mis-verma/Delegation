import { memo } from 'react';
import { StatusFigureStats, type StatusFigureItem } from '../../dashboard/StatusFigureStats';

export type MyChecklistsQuickFilterKey = 'pending' | 'completed' | 'due' | 'overdue';

export interface MyChecklistsQuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  overdue: number;
}

const ITEMS: readonly StatusFigureItem<MyChecklistsQuickFilterKey>[] = [
  { key: 'pending', kind: 'pending', label: 'Not done', note: 'This month', help: 'Checklists you still have to finish this month. Tap to show only these, tap again to show all.' },
  { key: 'completed', kind: 'completed', label: 'Done today', short: 'Done', note: 'Today', help: 'Checklists you finished today. Tap to show only these, tap again to show all.' },
  { key: 'due', kind: 'due', label: 'On time', note: 'This month', help: 'Checklists still inside their time this month. Tap to show only these, tap again to show all.' },
  { key: 'overdue', kind: 'late', label: 'Missed', note: 'This month', help: 'Checklists that closed before they were finished this month. Tap to show only these, tap again to show all.' },
];

interface MyChecklistsQuickStatsProps {
  counts: MyChecklistsQuickFilterCounts;
  total?: number;
  active: MyChecklistsQuickFilterKey | null;
  onToggle: (key: MyChecklistsQuickFilterKey) => void;
  onClear?: () => void;
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export const MyChecklistsQuickStats = memo(({ counts, total, active, onToggle, isLoading = false, error, onRetry }: MyChecklistsQuickStatsProps) => (
  <StatusFigureStats items={ITEMS} counts={counts} total={total} active={active} onToggle={onToggle} isLoading={isLoading} error={error} onRetry={onRetry} label="Checklist figures" />
));
MyChecklistsQuickStats.displayName = 'MyChecklistsQuickStats';
