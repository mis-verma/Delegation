import { memo } from 'react';
import { QuickFilterStats, statusTiles } from '../../../components/quickFilterStats';

export type MyChecklistsQuickFilterKey = 'pending' | 'completed' | 'due' | 'overdue';

export interface MyChecklistsQuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  overdue: number;
}

const TILES = statusTiles<MyChecklistsQuickFilterKey>(['pending', 'completed', 'due', 'overdue'], {
  pending: 'Not done',
  completed: 'Done today',
  due: 'On track',
  overdue: 'Missed',
});

interface MyChecklistsQuickStatsProps {
  counts: MyChecklistsQuickFilterCounts;
  total?: number;
  active: MyChecklistsQuickFilterKey | null;
  onToggle: (key: MyChecklistsQuickFilterKey) => void;
  onClear: () => void;
  isLoading?: boolean;
}

export const MyChecklistsQuickStats = memo(({ counts, total, active, onToggle, onClear, isLoading }: MyChecklistsQuickStatsProps) => (
  <QuickFilterStats tiles={TILES} counts={counts} active={active} onToggle={onToggle} total={total} onClearFilter={onClear} totalLabel="Assigned to you" itemLabel="checklists" variant="navy" isLoading={isLoading} />
));
MyChecklistsQuickStats.displayName = 'MyChecklistsQuickStats';
