import { memo } from 'react';
import { Link } from 'react-router';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { Skeleton, EmptyState, InlineError } from '../../components';
import { useNow } from '../../lib/useNow';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, EVENT_TYPE_ICONS } from '../events/eventDisplay';
import { DASHBOARD_CARD_CLASS, cardIconTile, relativeDayLabel } from './dashboardDisplay';
import type { Event } from '../../api/events';

interface UpcomingEventsProps {
  events: Event[];
  isPending: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

// Same row as Recently created beside it: a plain divided row, the title up to two lines, the date on
// the right. The leading tile is the event type's own soft tint (red deadline, blue announcement,
// orange broadcast), so the type reads at a glance without a second chip.
const EventRow = memo(({ event, now }: { event: Event; now: number }) => {
  const Icon = EVENT_TYPE_ICONS[event.type];
  const day = relativeDayLabel(event.eventDate, now);
  return (
    <Link
      viewTransition
      to={`/events?open=${event.id}`}
      aria-label={`${event.title}, ${EVENT_TYPE_LABELS[event.type]}, ${day}`}
      className="flex items-center gap-3 min-h-14 px-4 sm:px-5 py-3 outline-none transition-colors duration-150 hover:bg-surface-hover/50 active:bg-surface-hover focus-visible:bg-surface-hover"
    >
      <span aria-hidden="true" className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${EVENT_TYPE_COLORS[event.type]}`}>
        <Icon className="size-3.5" />
      </span>
      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
        <p className="line-clamp-2 leading-snug text-sm font-display font-medium sm:font-semibold text-text">{event.title}</p>
        <p className="t-meta font-medium text-text-muted">{EVENT_TYPE_LABELS[event.type]}</p>
      </div>
      <span className={`self-start shrink-0 pt-0.5 t-meta font-medium tabular-nums ${day === 'Today' ? 'text-warning' : 'text-text-muted'}`}>{day}</span>
    </Link>
  );
});
EventRow.displayName = 'EventRow';

export const UpcomingEvents = ({ events, isPending, isError = false, onRetry }: UpcomingEventsProps) => {
  const now = useNow();

  return (
    <section id="upcoming-events" aria-labelledby="upcoming-events-heading" className={`relative ${DASHBOARD_CARD_CLASS} flex flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cardIconTile('coral')}>
            <CalendarClock className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="upcoming-events-heading" className="t-section font-display font-bold text-text tracking-tight">Upcoming events</h2>
            <p className="hidden sm:block t-meta font-medium text-text-muted">Deadlines, announcements and broadcasts</p>
          </div>
        </div>

        <Link
          viewTransition
          to="/events"
          className="inline-flex items-center gap-0.5 min-h-11 sm:min-h-9 px-2 rounded-lg text-sm font-display font-semibold text-primary-600 dark:text-primary-400 transition-colors hover:bg-surface-hover shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          View all
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {isError && (
        <div className="px-4 py-3 sm:px-5">
          <InlineError message="Couldn't load upcoming events." onRetry={onRetry} />
        </div>
      )}

      {isPending ? (
        <div className="flex flex-col divide-y divide-border/60" role="status" aria-label="Loading upcoming events">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 px-4 sm:px-5 py-3">
              <Skeleton className="size-7 rounded-lg shrink-0" />
              <div className="flex flex-1 min-w-0 flex-col gap-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3.5 w-20" />
              </div>
              <Skeleton className="h-3.5 w-14 shrink-0 self-start" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        isError ? null : (
          // No CTA: events, announcements and broadcasts are admin-authored, not something a
          // viewer here has a way to create.
          <div className="p-4 sm:p-5">
            <EmptyState size="compact" icon={CalendarClock} title="Nothing coming up" description="No deadlines, announcements or broadcasts yet." />
          </div>
        )
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {events.map((event) => <EventRow key={event.id} event={event} now={now} />)}
        </div>
      )}
    </section>
  );
};
