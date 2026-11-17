import { memo } from 'react';
import { StatusFigureStats, type StatusFigureItem } from '../../dashboard/StatusFigureStats';

export type ApprovalStatKey = 'waiting' | 'old' | 'attention';

export type ApprovalStatCounts = Record<ApprovalStatKey, number>;

const ITEMS: readonly StatusFigureItem<ApprovalStatKey>[] = [
  { key: 'waiting', kind: 'total', label: 'Waiting', note: 'All in your queue', help: 'Every checklist waiting on your review. Tap to show all.' },
  { key: 'old', kind: 'late', label: 'Over a day', short: 'Over 1d', note: 'Waiting 24h+', help: 'Waiting more than 24 hours. Tap to show only these, tap again to show all.' },
  { key: 'attention', kind: 'due', label: 'Needs a look', short: 'Look', note: 'Flagged answers', help: 'Failed checks, missing or weak photos. Tap to show only these, tap again to show all.' },
];

interface ChecklistApprovalStatsProps {
  counts: ApprovalStatCounts;
  active: ApprovalStatKey | null;
  onToggle: (key: ApprovalStatKey) => void;
  isLoading: boolean;
  error: boolean;
  onRetry: () => void;
}

export const ChecklistApprovalStats = memo(({ counts, active, onToggle, isLoading, error, onRetry }: ChecklistApprovalStatsProps) => (
  <StatusFigureStats items={ITEMS} counts={counts} active={active} onToggle={onToggle} isLoading={isLoading} error={error} onRetry={onRetry} label="Checklist approval figures" />
));
ChecklistApprovalStats.displayName = 'ChecklistApprovalStats';
