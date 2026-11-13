import { memo, useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { preloadWhenIdle } from '../../lib/preloadWhenIdle';
import { Trash2, Pencil, CalendarClock, Clock3, History, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Skeleton, GradientIconTile, IconChip, InlineError, QuickFilterStats, EmptyState, Fab, useConfirm } from '../../components';
import { useAuth } from '@/context/AuthContext';
import { useEventsQuery, useDeleteEventMutation } from './hook';
import { EVENT_TYPE_LABELS, EVENT_TYPE_SOLID, EVENT_TYPE_GRADIENT, EVENT_TYPE_ICONS, EVENT_TYPE_TILES } from './eventDisplay';
import type { Event, EventType } from '@/api/events';

const loadEventForm = () => import('./EventForm');
const EventForm = lazy(() =>
  loadEventForm().then(module => ({ default: module.EventForm }))
);

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3';

const ICON_BUTTON =
  'flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-lg text-text-light transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 pointer-fine:size-9';

const whenLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

interface EventCardProps {
  event: Event;
  isPast: boolean;
  canManage: boolean;
  isDeleting: boolean;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
}

const EventCard = memo(({ event, isPast, canManage, isDeleting, onEdit, onDelete }: EventCardProps) => {
  const Icon = EVENT_TYPE_ICONS[event.type];
  return (
    <article
      aria-busy={isDeleting || undefined}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-4 transition-[border-color,opacity] duration-150 ease-out hover:border-border-hover',
        isPast && 'bg-surface-hover/30',
        isDeleting && 'pointer-events-none opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-white ring-1 ring-inset ring-white/20', isPast && 'opacity-70')}
          style={{ background: EVENT_TYPE_GRADIENT[event.type] }}
          aria-hidden="true"
        >
          <Icon size={18} strokeWidth={2.25} />
        </span>

        {canManage && (
          <div className="-mr-2 -mt-2 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(event)}
              className={cn(ICON_BUTTON, 'hover:bg-primary-500/10 hover:text-primary-600 focus-visible:ring-primary-500/50')}
              aria-label={`Edit ${event.title}`}
            >
              <Pencil size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(event)}
              disabled={isDeleting}
              className={cn(ICON_BUTTON, 'hover:bg-danger/10 hover:text-danger focus-visible:ring-danger/50')}
              aria-label={`Delete ${event.title}`}
            >
              {isDeleting ? <Loader2 size={15} className="animate-spin text-danger" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
            </button>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <h3 className={cn('line-clamp-2 t-card font-display font-bold leading-snug', isPast ? 'text-text-secondary' : 'text-text')}>{event.title}</h3>
        {event.description && <p className="line-clamp-3 text-sm leading-relaxed text-text-muted">{event.description}</p>}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <IconChip icon={Icon} tone={EVENT_TYPE_SOLID[event.type]} label={EVENT_TYPE_LABELS[event.type]} />
        <IconChip
          icon={isPast ? History : Clock3}
          tone={isPast ? 'bg-surface-hover/80' : 'bg-primary-600 dark:bg-primary-400'}
          label={isPast ? `Past · ${whenLabel(event.eventDate)}` : whenLabel(event.eventDate)}
          labelClassName="tabular-nums"
        />
      </div>
    </article>
  );
});
EventCard.displayName = 'EventCard';

export const EventList = () => {
  useEffect(() => preloadWhenIdle(loadEventForm), []);
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'PC';
  const confirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [typeFilter, setTypeFilter] = useState<EventType | null>(null);

  const { data: events = [], isPending, isError, refetch } = useEventsQuery();
  const { mutate: deleteEvent, isPending: deleting, variables: deletingId } = useDeleteEventMutation();

  const [now] = useState(() => Date.now());

  const counts = useMemo(() => {
    const base: Record<EventType, number> = { DEADLINE: 0, ANNOUNCEMENT: 0, BROADCAST: 0 };
    for (const e of events) base[e.type]++;
    return base;
  }, [events]);

  const { upcoming, past } = useMemo(() => {
    const shown = typeFilter ? events.filter((e) => e.type === typeFilter) : events;
    const timed = shown.map((e) => ({ e, at: new Date(e.eventDate).getTime() }));
    return {
      upcoming: timed.filter((x) => x.at >= now).sort((a, b) => a.at - b.at).map((x) => x.e),
      past: timed.filter((x) => x.at < now).sort((a, b) => b.at - a.at).map((x) => x.e),
    };
  }, [events, typeFilter, now]);

  const toggleTypeFilter = (key: EventType) => setTypeFilter((prev) => (prev === key ? null : key));

  const closeForm = () => {
    setShowForm(false);
    setEditingEvent(null);
  };

  const askDelete = useCallback(async (event: Event) => {
    const ok = await confirm({
      title: `Delete "${event.title}"?`,
      description: 'It disappears from the calendar for everyone. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteEvent(event.id);
  }, [confirm, deleteEvent]);

  const renderGroup = (title: string, list: Event[], isPast: boolean) =>
    list.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 t-card font-display font-bold text-text">
          {title}
          <span className="t-meta font-semibold tabular-nums text-text-muted">{list.length}</span>
        </h2>
        <div className={GRID}>
          {list.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              isPast={isPast}
              canManage={canManage}
              isDeleting={deleting && deletingId === e.id}
              onEdit={setEditingEvent}
              onDelete={askDelete}
            />
          ))}
        </div>
      </section>
    );

  const renderContent = () => {
    if (isPending) return <EventListSkeleton />;

    if (isError) return <InlineError message="Couldn't load events. Check your connection and try again." onRetry={() => void refetch()} />;

    if (events.length === 0) {
      return (
        <EmptyState
          icon={CalendarClock}
          title="No events yet"
          description={canManage ? 'Add a deadline, announcement or broadcast and it shows up here and on the calendar.' : 'Deadlines, announcements and broadcasts show up here once someone adds one.'}
          action={canManage ? { label: 'New event', onClick: () => setShowForm(true) } : undefined}
        />
      );
    }

    if (upcoming.length === 0 && past.length === 0) {
      return (
        <EmptyState
          icon={CalendarClock}
          title={`No ${EVENT_TYPE_LABELS[typeFilter!].toLowerCase()}s`}
          description="Clear the filter to see every event."
          action={{ label: 'Clear filter', onClick: () => setTypeFilter(null) }}
        />
      );
    }

    return (
      <div className="flex flex-col gap-6">
        {renderGroup('Coming up', upcoming, false)}
        {renderGroup('Past', past, true)}
      </div>
    );
  };

  const activeModal = showForm || editingEvent;

  return (
    <div className="mx-auto flex w-full max-w-(--container-width) flex-col gap-3 pb-10 pt-2.5 sm:gap-6">
      <header className="hidden items-center justify-between gap-3 sm:flex">
        <div className="flex min-w-0 items-center gap-3">
          <GradientIconTile icon={CalendarClock} />
          <h1 className="t-section font-display font-bold text-text">Events</h1>
        </div>
        {canManage && (
          <Button size="sm" variant="primary" className="hidden md:inline-flex" onClick={() => setShowForm(true)}>
            <Plus size={16} aria-hidden="true" />
            New event
          </Button>
        )}
      </header>

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

      {renderContent()}

      {canManage && <Fab actions={[{ key: 'new', label: 'New event', icon: Plus, onClick: () => setShowForm(true) }]} />}

      {activeModal && (
        <Suspense fallback={null}>
          <EventForm onClose={closeForm} event={editingEvent ?? undefined} />
        </Suspense>
      )}
    </div>
  );
};

const EventListSkeleton = () => (
  <div className={GRID} role="status" aria-label="Loading events">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-4">
        <Skeleton className="size-10 shrink-0 rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 max-w-40" />
          <Skeleton className="h-3 max-w-56" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-7 w-24 rounded-lg" />
          <Skeleton className="h-7 w-28 rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);
