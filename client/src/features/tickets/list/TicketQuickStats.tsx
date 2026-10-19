import { QuickFilterStats, statusTiles } from "../../../components/quickFilterStats";

export type TicketQuickFilterKey = 'pending' | 'completed' | 'due' | 'delayed';

export interface TicketQuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  delayed: number;
}

const TILES = statusTiles<TicketQuickFilterKey>(['pending', 'completed', 'due', 'delayed'], { due: 'Due Soon' });

interface TicketQuickStatsProps {
  counts: TicketQuickFilterCounts;
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
