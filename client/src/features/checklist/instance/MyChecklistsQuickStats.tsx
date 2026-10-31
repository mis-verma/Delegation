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
  { key: 'pending', kind: 'pending', label: 'Not done', help: 'Checklists you still have to finish. Tap to show only these, tap again to show all.' },
  { key: 'completed', kind: 'completed', label: 'Done today', short: 'Done', help: 'Checklists you finished today. Tap to show only these, tap again to show all.' },
  { key: 'due', kind: 'due', label: 'On track', help: 'Checklists still inside their time. Tap to show only these, tap again to show all.' },
  { key: 'overdue', kind: 'late', label: 'Missed', help: 'Checklists that closed before they were finished. Tap to show only these, tap again to show all.' },
];

interface MyChecklistsQuickStatsProps {
  counts: MyChecklistsQuickFilterCounts;
  total?: number;
  active: MyChecklistsQuickFilterKey | null;
  onToggle: (key: MyChecklistsQuickFilterKey) => void;
  onClear?: () => void;
  isLoading?: boolean;
}

export const MyChecklistsQuickStats = memo(({ counts, total, active, onToggle, isLoading = false }: MyChecklistsQuickStatsProps) => (
  <StatusFigureStats items={ITEMS} counts={counts} total={total} active={active} onToggle={onToggle} isLoading={isLoading} label="Checklist figures" />
));
MyChecklistsQuickStats.displayName = 'MyChecklistsQuickStats';
