import { memo } from 'react';
import { Link } from 'react-router';
import { CalendarClock } from 'lucide-react';
import { Skeleton, EntityIconTile, EmptyState, InlineError } from '../../components';
import { useNow } from '../../lib/useNow';
import { EVENT_TYPE_COLORS, EVENT_TYPE_ICON_TINTS, EVENT_TYPE_LABELS, EVENT_TYPE_ICONS } from '../events/eventDisplay';
import { DASHBOARD_CARD_CLASS, relativeDayLabel } from './dashboardDisplay';
import type { Event } from '../../api/events';

interface UpcomingEventsProps {
  events: Event[];
  isPending: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

const EventRow = memo(({ event, now }: { event: Event; now: number }) => {
  const Icon = EVENT_TYPE_ICONS[event.type];
  const day = relativeDayLabel(event.eventDate, now);
  return (
    <Link
      to={`/events?open=${event.id}`}
      aria-label={`${event.title}, ${EVENT_TYPE_LABELS[event.type]}, ${day}`}
      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-h-11 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg hover:bg-surface-hover/60 active:bg-surface-hover transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div aria-hidden="true" className={`flex items-center justify-center shrink-0 ${EVENT_TYPE_ICON_TINTS[event.type]}`}>
          <Icon size={14} />
        </div>
        <p className="text-[0.8125rem] sm:text-sm font-display font-medium text-text line-clamp-2 leading-snug">{event.title}</p>
      </div>

      <div className="flex items-center gap-4 pl-11 sm:pl-0 shrink-0">
        <span className={`inline-flex items-center justify-center text-xs font-display font-medium px-2.5 py-1 rounded-full ${EVENT_TYPE_COLORS[event.type]}`}>
          {EVENT_TYPE_LABELS[event.type]}
        </span>
        <span className={`text-xs font-display font-medium sm:min-w-20 sm:text-right ${day === 'Today' ? 'text-warning' : 'text-text-muted'}`}>{day}</span>
      </div>
    </Link>
  );
});
EventRow.displayName = 'EventRow';

export const UpcomingEvents = ({ events, isPending, isError = false, onRetry }: UpcomingEventsProps) => {
  const now = useNow();

  return (
    <section id="upcoming-events" aria-labelledby="upcoming-events-heading" className={`relative ${DASHBOARD_CARD_CLASS} flex flex-col hover:border-primary-500/30 transition-colors duration-200 overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 sm:gap-4 px-3 sm:px-5 py-2.5 sm:py-4 border-b border-border/40">
        <div className="flex items-center gap-3">
          <EntityIconTile icon={CalendarClock} className="size-8 sm:size-10" iconClassName="size-4 sm:size-5" />
          <div>
            <h2 id="upcoming-events-heading" className="text-sm sm:text-lg font-display font-semibold sm:font-bold text-text tracking-tight">Upcoming events</h2>
            <p className="hidden sm:block text-xs font-medium text-text-muted mt-0.5">Deadlines, announcements and broadcasts</p>
          </div>
        </div>

        <Link
          to="/events"
          className="inline-flex items-center min-h-11 px-3 rounded-md text-xs font-display font-medium text-text-muted hover:text-primary-600 hover:bg-surface-hover transition-colors duration-200 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          View all
        </Link>
      </div>

      <div className="flex flex-col gap-1 p-2">
        {isError && <InlineError message="Couldn't load upcoming events." onRetry={onRetry} />}

        {isPending ? (
          <div className="flex flex-col gap-1" role="status" aria-label="Loading upcoming events">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg">
                <Skeleton className="size-8 rounded-lg shrink-0" />
                <Skeleton className="h-4 flex-1 max-w-sm" />
                <Skeleton className="h-6 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          isError ? null : (
            // No CTA: events, announcements and broadcasts are admin-authored, not something a
            // viewer here has a way to create.
            <EmptyState size="compact" className="h-24" icon={CalendarClock} title="Nothing coming up" description="No deadlines, announcements or broadcasts yet." />
          )
        ) : (
          events.map((event) => <EventRow key={event.id} event={event} now={now} />)
        )}
      </div>
    </section>
  );
};
