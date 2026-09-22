import { QuickFilterStats, statusTiles } from '../../../components/quickFilterStats';

export type ComplianceQuickFilterKey = 'all' | 'completed' | 'pending' | 'overdue';

export interface ComplianceQuickFilterCounts {
  all: number;
  completed: number;
  pending: number;
  overdue: number;
}

// "All" leads (and doubles as the clear-filter tile, so it takes the navy hero slot at index 0).
// Both labels here are genuinely board-specific wording — "Total" is what this page counts
// (every checklist run, not the internal "instance" term), and "Not yet complete" is clearer
// than a bare "Pending" next to an "Overdue" tile.
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
