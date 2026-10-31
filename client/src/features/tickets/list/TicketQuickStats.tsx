import { StatusFigureStats, type StatusFigureItem } from "../../dashboard/StatusFigureStats";

export type TicketQuickFilterKey = 'pending' | 'completed' | 'due' | 'delayed';

export interface TicketQuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  delayed: number;
}

const ITEMS: readonly StatusFigureItem<TicketQuickFilterKey>[] = [
  { key: 'pending', kind: 'pending', label: 'Pending', help: 'Tickets still open. Tap to show only these, tap again to show all.' },
  { key: 'completed', kind: 'completed', label: 'Completed', short: 'Done', help: 'Tickets that are finished. Tap to show only these, tap again to show all.' },
  { key: 'due', kind: 'due', label: 'Due Soon', short: 'Due soon', help: 'Tickets coming due. Tap to show only these, tap again to show all.' },
  { key: 'delayed', kind: 'late', label: 'Delayed', help: 'Tickets past their deadline. Tap to show only these, tap again to show all.' },
];

interface TicketQuickStatsProps {
  counts: TicketQuickFilterCounts;
  total: number;
  active: TicketQuickFilterKey | null;
  onToggle: (key: TicketQuickFilterKey) => void;
  onClear?: () => void;
  isLoading?: boolean;
}

export const TicketQuickStats = ({ counts, total, active, onToggle, isLoading }: TicketQuickStatsProps) => (
  <div className="relative w-full">
    <StatusFigureStats items={ITEMS} counts={counts} total={total} active={active} onToggle={onToggle} isLoading={isLoading} label="Ticket figures" />
  </div>
);
