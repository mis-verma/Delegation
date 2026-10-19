import { QuickFilterStats, statusTiles } from "../../components/quickFilterStats";

export type QuickFilterKey = 'pending' | 'completed' | 'due' | 'delayed';

export interface QuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  delayed: number;
}

const TILES = statusTiles<QuickFilterKey>(['pending', 'completed', 'due', 'delayed']);

interface TaskQuickStatsProps {
  counts: QuickFilterCounts;
  total: number;
  active: QuickFilterKey | null;
  onToggle: (key: QuickFilterKey) => void;
  onClear: () => void;
  isLoading?: boolean;
}

export const TaskQuickStats = ({ counts, total, active, onToggle, onClear, isLoading }: TaskQuickStatsProps) => (
  <QuickFilterStats
    tiles={TILES}
    counts={counts}
    active={active}
    onToggle={onToggle}
    total={total}
    onClearFilter={onClear}
    itemLabel="delegations"
    variant="navy"
    isLoading={isLoading}
  />
);
