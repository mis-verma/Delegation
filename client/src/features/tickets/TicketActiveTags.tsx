import { X } from 'lucide-react';
import type { useTicketOrganizer } from './useTicketOrganizer';
import type { Ticket } from '../../api/ticket';

interface TicketActiveTagsProps {
  organizer: ReturnType<typeof useTicketOrganizer>;
  allTickets: Ticket[];
}

// Pill that states an active filter. The remove button is a real tap target on touch screens
// (`pointer-coarse:`) while staying compact for a mouse.
const CHIP_CLASS = 'flex items-center gap-1 min-w-0 pl-3 pr-1 py-0.5 min-h-8 pointer-coarse:min-h-11 text-xs font-display font-medium rounded-full bg-primary-500/10 text-primary-700 dark:text-primary-300 border border-primary-500/20';
const REMOVE_CLASS = 'flex items-center justify-center size-6 pointer-coarse:size-9 shrink-0 rounded-full cursor-pointer transition-colors duration-200 ease-in-out hover:bg-primary-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

export const TicketActiveTags = ({ organizer, allTickets }: TicketActiveTagsProps) => {
  const { quickFilter } = organizer;
  // Nothing to show: render nothing, not an empty box that still takes a gap slot in the toolbar
  // (it pushed Options 24px off the page edge on phones).
  if (!quickFilter && !organizer.assigneeIdFilter) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      {quickFilter && (
        <span className={CHIP_CLASS}>
          <span className="min-w-0 break-words">
            Showing: {quickFilter.charAt(0).toUpperCase() + quickFilter.slice(1)}
          </span>
          <button
            type="button"
            onClick={() => organizer.toggleQuickFilter(quickFilter)}
            aria-label="Clear status filter"
            className={REMOVE_CLASS}
          >
            <X size={13} />
          </button>
        </span>
      )}

      {organizer.assigneeIdFilter && (
        <span className={CHIP_CLASS}>
          <span className="min-w-0 break-words">
            Showing tickets for {allTickets[0]?.assignee?.firstName ?? 'this person'}
          </span>
          <button
            type="button"
            onClick={() => organizer.setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('assigneeIds'); return p; })}
            aria-label="Clear person filter"
            className={REMOVE_CLASS}
          >
            <X size={13} />
          </button>
        </span>
      )}
    </div>
  );
};
