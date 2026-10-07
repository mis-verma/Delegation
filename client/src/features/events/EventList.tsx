import { useMemo, useState, lazy, Suspense } from 'react';
import { Trash2, Pencil, CalendarClock, Clock3, Loader2, AlertCircle } from 'lucide-react';
import { Button, Skeleton, GradientIconTile, IconChip, QuickFilterStats, EmptyState } from '../../components';
import { QuickFilterPill } from '../../components/filterRow/QuickFilterPill';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useEventsQuery, useDeleteEventMutation } from './hook';
import { EVENT_TYPE_LABELS, EVENT_TYPE_SOLID, EVENT_TYPE_GRADIENT, EVENT_TYPE_ICONS, EVENT_TYPE_TILES } from './eventDisplay';
import type { Event, EventType } from '@/api/events';

const EventForm = lazy(() =>
  import('./EventForm').then(module => ({ default: module.EventForm }))
);

export const EventList = () => {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'PC';

  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [typeFilter, setTypeFilter] = useState<EventType | null>(null);

  const { data: events = [], isPending, isError } = useEventsQuery();
  const deleteMut = useDeleteEventMutation();

  // eslint-disable-next-line react-hooks/purity -- read once per mount, same as HomePage/Calendar's own "now" memo.
  const now = useMemo(() => Date.now(), []);

  const counts = useMemo(() => {
    const base: Record<EventType, number> = { DEADLINE: 0, ANNOUNCEMENT: 0, BROADCAST: 0 };
    for (const e of events) base[e.type]++;
    return base;
  }, [events]);

  // Upcoming first (soonest next), THEN past (most recently passed first) — a plain ascending
  // sort put whatever was furthest in the past at the very top of the page, ahead of everything
  // still coming up, which is backwards for "what do I need to know about."
  const ordered = useMemo(() => {
    const upcoming = events.filter((e) => new Date(e.eventDate).getTime() >= now)
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    const past = events.filter((e) => new Date(e.eventDate).getTime() < now)
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    return [...upcoming, ...past];
  }, [events, now]);
  const visible = typeFilter ? ordered.filter((e) => e.type === typeFilter) : ordered;

  const toggleTypeFilter = (key: EventType) => setTypeFilter((prev) => (prev === key ? null : key));

  const closeForm = () => {
    setShowForm(false);
    setEditingEvent(null);
  };

  const renderContent = () => {
    if (isPending) return <EventListSkeleton />;

    if (isError) {
      return (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-display">
          <AlertCircle size={16} className="shrink-0" />
          <span>Failed to load events. Please check your network connection and try again.</span>
        </div>
      );
    }

    if (events.length === 0) {
      return (
        <EmptyState
          icon={CalendarClock}
          title="No events yet"
          description="Deadlines, announcements, and broadcasts will show up here once someone creates one."
        />
      );
    }

    if (visible.length === 0) {
      return (
        <EmptyState
          icon={CalendarClock}
          title={`No ${EVENT_TYPE_LABELS[typeFilter!].toLowerCase()}s`}
          description="Try clearing the filter to see every event."
          action={{ label: 'Clear filter', onClick: () => setTypeFilter(null) }}
        />
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((e, index) => {
          const Icon = EVENT_TYPE_ICONS[e.type];
          const isDeleting = deleteMut.isPending && deleteMut.variables === e.id;
          const isPast = new Date(e.eventDate).getTime() < now;

          return (
            <div
              key={e.id}
              className={`group relative flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface hover:border-primary-500/40 transition-all duration-200 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none ${
                isPast ? 'opacity-70 hover:opacity-100' : ''
              } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
              // Stagger caps at 8 steps — same cap TodoList.tsx uses, so a long list doesn't make
              // its last card wait noticeably longer than the rest.
              style={{ animationFillMode: 'backwards', animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className="flex items-center justify-center size-10 rounded-xl shrink-0 text-white ring-1 ring-inset ring-white/20"
                  style={{ background: EVENT_TYPE_GRADIENT[e.type] }}
                >
                  <Icon size={18} strokeWidth={2.25} />
                </div>

                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingEvent(e)}
                      className="p-2 text-text-light hover:text-primary-600 hover:bg-primary-500/10 rounded-lg transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      aria-label="Edit event"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(e.id)}
                      disabled={isDeleting}
                      className="p-2 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      aria-label="Delete event"
                    >
                      {isDeleting ? <Loader2 size={14} className="animate-spin text-danger" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-display font-semibold text-text leading-tight">{e.title}</h3>
                {e.description && (
                  <p className="text-xs text-text-muted font-display leading-relaxed line-clamp-2">{e.description}</p>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
                <IconChip icon={Icon} tone={EVENT_TYPE_SOLID[e.type]} label={EVENT_TYPE_LABELS[e.type]} />
                <Badge variant="secondary" className={isPast ? 'bg-surface-hover' : 'bg-surface'}>
                  <Clock3 size={12} strokeWidth={2} className="shrink-0 opacity-70" />
                  {isPast && 'Past · '}
                  {new Date(e.eventDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const activeModal = showForm || editingEvent;

  return (
    <div className="flex flex-col gap-6 mx-auto w-full max-w-(--container-width) transition-all duration-300 pb-10">
      <div className="flex items-center gap-3">
        <GradientIconTile icon={CalendarClock} />
        <div>
          <h1 className="text-xl font-display font-bold text-text">Events</h1>
        </div>
      </div>

      {/* Always shown, same as Tickets/Delegation's own stat row (even at zero) — QuickFilterStats
          handles its own loading skeleton via `isLoading`. */}
      <QuickFilterStats
        tiles={EVENT_TYPE_TILES}
        counts={counts}
        active={typeFilter}
        onToggle={toggleTypeFilter}
        total={events.length}
        onClearFilter={() => setTypeFilter(null)}
        itemLabel="events"
        variant="navy"
        isLoading={isPending}
      />

      {/* Desktop: inline button in its own toolbar row, right-aligned. Mobile: that row was just
          this one pill floating alone with the rest of the row empty, so it hides below `md` in
          favor of the Fab below — same split every other list page (Tickets/Tasks/To-Do) uses. */}
      {canManage && (
        <div className="hidden md:flex items-center justify-end">
          <Button
            size="sm"
            variant="primary"
            className="font-display font-semibold tracking-tight rounded-full"
            onClick={() => setShowForm(true)}
          >
            New event
          </Button>
        </div>
      )}

      {typeFilter && (
        <div>
          <QuickFilterPill filter={typeFilter} label={EVENT_TYPE_LABELS[typeFilter]} onClear={() => setTypeFilter(null)} />
        </div>
      )}

      {renderContent()}

      {activeModal && (
        <Suspense fallback={null}>
          <EventForm onClose={closeForm} event={editingEvent ?? undefined} />
        </Suspense>
      )}
    </div>
  );
};

const EventListSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface">
        <Skeleton className="size-10 rounded-xl shrink-0" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 max-w-40" />
          <Skeleton className="h-3 max-w-56" />
        </div>
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
    ))}
  </div>
);
