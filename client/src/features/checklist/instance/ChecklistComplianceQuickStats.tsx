import { InlineError } from '../../../components/inlineError';
import { QuickFilterStats, statusTiles } from '../../../components/quickFilterStats';

export type ComplianceQuickFilterKey = 'all' | 'completed' | 'due' | 'overdue';

export interface ComplianceQuickFilterCounts {
  all: number;
  completed: number;
  due: number;
  overdue: number;
}

const TILES = statusTiles<ComplianceQuickFilterKey>(['all', 'completed', 'due', 'overdue'], {
  all: 'All runs',
  completed: 'Done',
  due: 'On track',
  overdue: 'Missed',
});

const NO_COUNTS: ComplianceQuickFilterCounts = { all: 0, completed: 0, due: 0, overdue: 0 };

interface ChecklistComplianceQuickStatsProps {
  counts: ComplianceQuickFilterCounts | undefined;
  active: ComplianceQuickFilterKey;
  onToggle: (key: ComplianceQuickFilterKey) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export const ChecklistComplianceQuickStats = ({ counts, active, onToggle, isLoading, isError, onRetry }: ChecklistComplianceQuickStatsProps) => {
  if (isError && !counts) return <InlineError message="We couldn't load the checklist counts." onRetry={onRetry} />;

  return (
    <QuickFilterStats
      tiles={TILES}
      counts={counts ?? NO_COUNTS}
      active={active}
      onToggle={onToggle}
      itemLabel="checklists"
      variant="navy"
      isLoading={isLoading || !counts}
    />
  );
};
