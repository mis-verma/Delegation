import { QuickFilterStats, statusTiles } from '../../../components/quickFilterStats';

// Same four-tile shape Delegation and Tickets both use — "Pending" is the broad not-yet-done
// bucket (mirrors the Dashboard's own Due/Completed split), "Due" is its on-track subset, and
// "Overdue" is the subset that has run past its period end — the same pending/due/overdue
// relationship Tickets uses (as "delayed").
export type MyChecklistsQuickFilterKey = 'pending' | 'completed' | 'due' | 'overdue';

export interface MyChecklistsQuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  overdue: number;
}

const TILES = statusTiles<MyChecklistsQuickFilterKey>(['pending', 'completed', 'due', 'overdue']);

interface MyChecklistsQuickStatsProps {
  counts: MyChecklistsQuickFilterCounts;
  /** Everything in scope, unfiltered — the number the page header used to state in words. */
  total: number;
  active: MyChecklistsQuickFilterKey | null;
  onToggle: (key: MyChecklistsQuickFilterKey) => void;
  onClear: () => void;
  isLoading?: boolean;
}

export const MyChecklistsQuickStats = ({ counts, total, active, onToggle, onClear, isLoading }: MyChecklistsQuickStatsProps) => (
  <QuickFilterStats tiles={TILES} counts={counts} active={active} onToggle={onToggle} total={total} onClearFilter={onClear} totalLabel="Assigned to you" itemLabel="checklists" variant="navy" isLoading={isLoading} />
);
