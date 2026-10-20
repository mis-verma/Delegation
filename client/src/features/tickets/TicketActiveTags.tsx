import { X } from 'lucide-react';
import type { useTicketOrganizer } from './useTicketOrganizer';
import type { Ticket } from '../../api/ticket';

interface TicketActiveTagsProps {
  organizer: ReturnType<typeof useTicketOrganizer>;
  allTickets: Ticket[];
}

const CHIP_CLASS = 'flex items-center gap-1 min-w-0 max-w-full pl-3 pr-0.5 h-7 t-meta font-display font-medium rounded-full bg-primary-500/10 text-primary-700 dark:text-primary-300 border border-primary-500/20';
const REMOVE_CLASS = 'relative flex items-center justify-center size-6 shrink-0 rounded-full after:absolute after:-inset-2.5 cursor-pointer transition-colors duration-200 ease-in-out hover:bg-primary-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

export const TicketActiveTags = ({ organizer, allTickets }: TicketActiveTagsProps) => {
  if (!organizer.assigneeIdFilter) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      {organizer.assigneeIdFilter && (
        <span className={CHIP_CLASS}>
          <span className="min-w-0 truncate">
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
