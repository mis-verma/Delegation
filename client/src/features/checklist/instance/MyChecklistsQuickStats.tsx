import { memo } from 'react';
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

// Honest names: Not done = missed + on track, Done today = finished today (only today: earlier days are on
// the History page), On track = not done and before the cutoff, Missed = past the cutoff and not done.
// The other three cover this month up to today (see MyChecklists).
const TILES = statusTiles<MyChecklistsQuickFilterKey>(['pending', 'completed', 'due', 'overdue'], {
  pending: 'Not done',
  completed: 'Done today',
  due: 'On track',
  overdue: 'Missed',
});

interface MyChecklistsQuickStatsProps {
  counts: MyChecklistsQuickFilterCounts;
  /**
   * Optional lead tile with a headline count. The page leaves it out: it shows today's assigned
   * count in its own line instead, because that is not the same window as the tiles (three cover
   * this month up to today), so a total here would not match the numbers beside it.
   */
  total?: number;
  active: MyChecklistsQuickFilterKey | null;
  onToggle: (key: MyChecklistsQuickFilterKey) => void;
  onClear: () => void;
  /** The summary counts are still loading: tiles show placeholders instead of a false "0". */
  isLoading?: boolean;
}

// Memoized: the page re-renders on every keystroke-level state change (options sheet, view toggle),
// and the tiles only depend on these few props.
export const MyChecklistsQuickStats = memo(({ counts, total, active, onToggle, onClear, isLoading }: MyChecklistsQuickStatsProps) => (
  <QuickFilterStats tiles={TILES} counts={counts} active={active} onToggle={onToggle} total={total} onClearFilter={onClear} totalLabel="Assigned to you" itemLabel="checklists" variant="navy" isLoading={isLoading} />
));
MyChecklistsQuickStats.displayName = 'MyChecklistsQuickStats';
