import { QuickFilterStats, statusTiles } from "../../../components/quickFilterStats";

export type TicketQuickFilterKey = 'pending' | 'completed' | 'due' | 'delayed';

export interface TicketQuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  delayed: number;
}

// "Due Soon" rather than the catalogue's default "Due" — on Tickets the bucket means "approaching
// its TAT deadline", which is a narrower claim than the other modules' plain "Due".
const TILES = statusTiles<TicketQuickFilterKey>(['pending', 'completed', 'due', 'delayed'], { due: 'Due Soon' });

interface TicketQuickStatsProps {
  counts: TicketQuickFilterCounts;
  /** Everything in scope, unfiltered — the number the page header used to state in words. */
  total: number;
  active: TicketQuickFilterKey | null;
  onToggle: (key: TicketQuickFilterKey) => void;
  onClear: () => void;
  isLoading?: boolean;
}

export const TicketQuickStats = ({ counts, total, active, onToggle, onClear, isLoading }: TicketQuickStatsProps) => (
  <div className="relative w-full">
    <QuickFilterStats
      tiles={TILES}
      counts={counts}
      active={active}
      onToggle={onToggle}
      total={total}
      onClearFilter={onClear}
      itemLabel="tickets"
      variant="navy"
      isLoading={isLoading}
    />
  </div>
);
