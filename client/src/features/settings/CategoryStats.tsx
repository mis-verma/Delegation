import { memo } from 'react';
import { StatusFigureStats, type StatusFigureItem } from '../dashboard/StatusFigureStats';

export type CategoryStatKey = 'total' | 'active' | 'inactive' | 'headPicks';

export type CategoryStatCounts = Record<CategoryStatKey, number>;

const ITEMS: readonly StatusFigureItem<CategoryStatKey>[] = [
  { key: 'total', kind: 'total', label: 'All categories', short: 'All', note: 'Every category', help: 'Every category. Tap to show all.' },
  { key: 'active', kind: 'completed', label: 'Active', note: 'On new tickets', help: 'Categories people can pick on a new ticket. Tap to show only these.' },
  { key: 'inactive', kind: 'late', label: 'Inactive', note: 'Turned off', help: 'Categories that no longer show on new tickets. Tap to show only these.' },
  { key: 'headPicks', kind: 'due', label: 'Head picks', short: 'Head', note: 'No fixed person', help: 'Active categories where the department head picks the person. Tap to show only these.' },
];

interface CategoryStatsProps {
  counts: CategoryStatCounts;
  active: CategoryStatKey | null;
  onToggle: (key: CategoryStatKey) => void;
  isLoading: boolean;
  error: boolean;
  onRetry: () => void;
}

export const CategoryStats = memo(({ counts, active, onToggle, isLoading, error, onRetry }: CategoryStatsProps) => (
  <StatusFigureStats items={ITEMS} counts={counts} active={active} onToggle={onToggle} isLoading={isLoading} error={error} onRetry={onRetry} label="Category figures" />
));
CategoryStats.displayName = 'CategoryStats';
