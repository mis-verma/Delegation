import { QuickFilterStats, statusTiles } from '../../../components/quickFilterStats';

export type ComplianceQuickFilterKey = 'all' | 'completed' | 'pending' | 'overdue';

export interface ComplianceQuickFilterCounts {
  all: number;
  completed: number;
  pending: number;
  overdue: number;
}

const TILES = statusTiles<ComplianceQuickFilterKey>(['all', 'completed', 'pending', 'overdue'], {
  all: 'Total',
  pending: 'Not yet complete',
});

interface ChecklistComplianceQuickStatsProps {
  counts: ComplianceQuickFilterCounts;
  active: ComplianceQuickFilterKey;
  onToggle: (key: ComplianceQuickFilterKey) => void;
  isLoading?: boolean;
}

export const ChecklistComplianceQuickStats = ({ counts, active, onToggle, isLoading }: ChecklistComplianceQuickStatsProps) => (
  <QuickFilterStats tiles={TILES} counts={counts} active={active} onToggle={onToggle} itemLabel="checklists" variant="navy" isLoading={isLoading} />
);
