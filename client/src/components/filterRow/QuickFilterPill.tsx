import { X } from 'lucide-react';
import { FilterPill } from './FilterPrimitives';

interface QuickFilterPillProps {
  /** The picked stat card's key, or null when none is picked (nothing renders). */
  filter: string | null;
  /** Overrides the words derived from the key, for example an event type's own label. */
  label?: string;
  onClear: () => void;
}

/**
 * "Showing: Pending x" under a stat row: what tapping a stat card did, with a cross to undo it. One pill for
 * every list page, so a selected card reads the same on Delegation, Tickets, To-Do, Checklists and Events.
 */
export const QuickFilterPill = ({ filter, label, onClear }: QuickFilterPillProps) => {
  if (!filter) return null;
  const text = label ?? filter.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return (
    <FilterPill active icon={X} onClick={onClear}>
      <span className="sr-only">Clear status filter: </span>
      Showing: {text}
    </FilterPill>
  );
};
