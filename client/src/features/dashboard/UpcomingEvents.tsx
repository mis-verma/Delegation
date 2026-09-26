import { Link } from 'react-router';
import { CalendarClock } from 'lucide-react';
import { Skeleton, EntityIconTile } from '../../components';
import { EVENT_TYPE_COLORS, EVENT_TYPE_ICON_TINTS, EVENT_TYPE_LABELS, EVENT_TYPE_ICONS } from '../events/eventDisplay';
import { DASHBOARD_CARD_CLASS } from './dashboardDisplay';
import type { Event } from '../../api/events';

interface UpcomingEventsProps {
  events: Event[];
  isPending: boolean;
}

export const UpcomingEvents = ({ events, isPending }: UpcomingEventsProps) => (
  <section id="upcoming-events" aria-labelledby="upcoming-events-heading" className={`relative group ${DASHBOARD_CARD_CLASS} flex flex-col hover:border-primary-500/30 transition-colors duration-500 overflow-hidden`}>


    <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 border-b border-border/40 bg-surface/50 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <EntityIconTile icon={CalendarClock} />
        <div>
          <h2 id="upcoming-events-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight">Upcoming Events</h2>
          <p className="hidden sm:block text-xs font-medium text-text-muted mt-0.5">Deadlines, announcements, and broadcasts</p>
        </div>
      </div>

      <Link
        to="/events"
        className="px-3 py-1.5 rounded-md text-xs font-display font-medium text-text-muted hover:text-primary-600 hover:bg-surface-hover transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        View all
      </Link>
    </div>

    <div className="relative z-10 flex flex-col p-2">
      {isPending ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg">
              <Skeleton className="size-8 rounded-lg shrink-0" />
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-4 w-3/4 max-w-sm rounded" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        // No fixed-height match to preserve here (unlike the chart cards) — this was just loose
        // padding around a single line, so it tightens freely. No CTA either: events, announcements
        // and broadcasts are admin-authored, not something a viewer here has a way to create.
        // One quiet line on phones; the centred icon + sentence only where there's room for it.
        <div className="flex sm:flex-col items-center justify-center py-5 sm:py-7 text-center gap-2 sm:gap-2.5">
          <div className="p-2 sm:p-2.5 rounded-full bg-surface-hover border border-border/50">
            <CalendarClock size={16} className="text-text-muted sm:size-[18px]" />
          </div>
          <p className="text-xs sm:text-sm font-display text-text-muted font-medium">
            <span className="sm:hidden">Nothing coming up.</span>
            <span className="hidden sm:inline">No upcoming deadlines, announcements or broadcasts.</span>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {events.map(e => {
            const Icon = EVENT_TYPE_ICONS[e.type];
            return (
              <Link
                key={e.id}
                to="/events"
                className="group/item flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg hover:bg-surface-hover/60 active:bg-surface-hover active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div aria-hidden="true" className={`flex items-center justify-center shrink-0 ${EVENT_TYPE_ICON_TINTS[e.type]}`}>
                    <Icon size={14} />
                  </div>

                  <p className="text-sm font-display font-medium text-text truncate">
                    {e.title}
                  </p>
                </div>

                <div className="flex items-center gap-4 pl-11 sm:pl-0 shrink-0">
                  <span className={`inline-flex items-center justify-center text-[11px] font-display font-medium px-2.5 py-1 rounded-full ${EVENT_TYPE_COLORS[e.type]}`}>
                    {EVENT_TYPE_LABELS[e.type]}
                  </span>

                  <span className="text-xs text-text-muted font-display font-medium min-w-[50px] text-right">
                    {new Date(e.eventDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  </section>
);