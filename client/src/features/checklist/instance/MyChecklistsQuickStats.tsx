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
  /**
   * Today's assigned count, for the lead tile — not "everything in scope, unfiltered": `counts`
   * mixes an all-time scope (Pending/Due/Overdue, which must stay all-time or a still-open weekly/
   * monthly checklist would vanish most days) with a today-only one (Completed), so there's no
   * single number left that's really "the total" of the row below it. Passing one anyway would
   * make every tile's "X% of total" caption nonsense against a mismatched denominator — omit this
   * (leave it `undefined`) rather than guess at one; the row still works fine with no lead tile.
   */
  total?: number;
  active: MyChecklistsQuickFilterKey | null;
  onToggle: (key: MyChecklistsQuickFilterKey) => void;
  onClear: () => void;
  isLoading?: boolean;
}

export const MyChecklistsQuickStats = ({ counts, total, active, onToggle, onClear, isLoading }: MyChecklistsQuickStatsProps) => (
  <QuickFilterStats tiles={TILES} counts={counts} active={active} onToggle={onToggle} total={total} onClearFilter={onClear} totalLabel="Assigned to you" itemLabel="checklists" variant="navy" isLoading={isLoading} />
);
