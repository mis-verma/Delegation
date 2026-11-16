import { useCallback, useEffect, useMemo, useState, lazy, Suspense, type ComponentType } from 'react';
import { useSearchParams } from 'react-router';
import { preloadWhenIdle } from '../../lib/preloadWhenIdle';
import { CalendarClock, Plus } from 'lucide-react';
import { Button, Skeleton, GradientIconTile, InlineError, EmptyState, Fab, SearchField, SelectDropdown, ViewToggle, useConfirm } from '../../components';
import { useAuth } from '@/context/AuthContext';
import { useEventsQuery, useDeleteEventMutation } from './hook';
import {
  EVENT_STATUS_EMPTY,
  EVENT_STATUS_ITEMS,
  EVENT_STATUS_KEYS,
  EVENT_STATUS_MATCH,
  EVENT_TYPE_FILTER_OPTIONS,
  EVENT_TYPE_LABELS,
  EVENT_VIEW_KEYS,
  EVENT_VIEW_TABS,
  buildEventClock,
  type EventStatus,
  type EventTypeFilter,
  type EventView,
} from './eventDisplay';
import { EventCards, EventRows, EventTable, type EventViewProps } from './EventViews';
import { StatusFigureStats } from '../dashboard/StatusFigureStats';
import type { Event } from '@/api/events';

const loadEventForm = () => import('./EventForm');
const EventForm = lazy(() =>
  loadEventForm().then(module => ({ default: module.EventForm }))
);

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3';

const VIEW_COMPONENT: Record<EventView, ComponentType<EventViewProps>> = {
  cards: EventCards,
  list: EventRows,
  table: EventTable,
};

const TYPE_KEYS: Record<EventTypeFilter, true> = { ALL: true, DEADLINE: true, ANNOUNCEMENT: true, BROADCAST: true };

const readStatus = (raw: string | null): EventStatus | null =>
  raw && (EVENT_STATUS_KEYS as string[]).includes(raw) ? (raw as EventStatus) : null;

const readView = (raw: string | null): EventView => (raw && raw in EVENT_VIEW_KEYS ? (raw as EventView) : 'cards');

const readType = (raw: string | null): EventTypeFilter => (raw && raw in TYPE_KEYS ? (raw as EventTypeFilter) : 'ALL');

export const EventList = () => {
  useEffect(() => preloadWhenIdle(loadEventForm), []);
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'PC';
  const confirm = useConfirm();

  const [searchParams, setSearchParams] = useSearchParams();
  const status = readStatus(searchParams.get('status'));
  const view = readView(searchParams.get('view'));
  const typeFilter = readType(searchParams.get('type'));
  const search = searchParams.get('q') ?? '';

  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const { data: events = [], isPending, isError, refetch } = useEventsQuery();
  const { mutate: deleteEvent, isPending: deleting, variables: deletingVars } = useDeleteEventMutation();

  const [now] = useState(() => Date.now());

  const { counts, upcoming, past } = useMemo(() => {
    const clock = buildEventClock(now);
    const needle = search.trim().toLowerCase();
    const tally: Record<EventStatus, number> = { upcoming: 0, today: 0, week: 0, past: 0 };
    const timed = events.map((e) => ({ e, at: new Date(e.eventDate).getTime() }));
    for (const { at } of timed) {
      for (const key of EVENT_STATUS_KEYS) if (EVENT_STATUS_MATCH[key](at, clock)) tally[key]++;
    }
    const shown = timed.filter(({ e, at }) =>
      (typeFilter === 'ALL' || e.type === typeFilter) &&
      (!status || EVENT_STATUS_MATCH[status](at, clock)) &&
      (!needle || e.title.toLowerCase().includes(needle) || (e.description ?? '').toLowerCase().includes(needle)),
    );
    return {
      counts: tally,
      upcoming: shown.filter((x) => x.at >= now).sort((a, b) => a.at - b.at).map((x) => x.e),
      past: shown.filter((x) => x.at < now).sort((a, b) => b.at - a.at).map((x) => x.e),
    };
  }, [events, status, typeFilter, search, now]);

  const filtered = status !== null || typeFilter !== 'ALL' || search.trim() !== '';

  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('status');
      next.delete('type');
      next.delete('q');
      return next;
    }, { replace: true });
  };

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

  const ViewComponent = VIEW_COMPONENT[view];
  const deletingId = deleting ? deletingVars : undefined;

  const renderGroup = (title: string, list: Event[], isPast: boolean) =>
    list.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 t-card font-display font-bold text-text">
          {title}
          <span className="t-meta font-semibold tabular-nums text-text-muted">{list.length}</span>
        </h2>
        <ViewComponent items={list} isPast={isPast} canManage={canManage} deletingId={deletingId} onEdit={setEditingEvent} onDelete={askDelete} />
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
      const title = status ? EVENT_STATUS_EMPTY[status] : typeFilter !== 'ALL' ? `No ${EVENT_TYPE_LABELS[typeFilter].toLowerCase()}s` : 'No matching events';
      return (
        <EmptyState
          icon={CalendarClock}
          title={title}
          description="Clear the filters to see every event."
          action={{ label: 'Clear filters', onClick: clearFilters }}
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

      <StatusFigureStats
        label="Events summary"
        items={EVENT_STATUS_ITEMS}
        counts={counts}
        active={status}
        onToggle={(key) => setParam('status', status === key ? null : key)}
        isLoading={isPending}
        error={isError}
        onRetry={() => void refetch()}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={(v) => setParam('q', v)}
          label="Search events by title or description"
          placeholder="Search events"
          className="min-w-0 flex-1 basis-48"
        />
        <div className="w-40 shrink-0">
          <SelectDropdown
            value={typeFilter}
            onChange={(v) => setParam('type', v === 'ALL' ? null : v)}
            options={EVENT_TYPE_FILTER_OPTIONS}
            aria-label="Filter events by type"
          />
        </div>
        <ViewToggle tabs={EVENT_VIEW_TABS} value={view} onChange={(v) => setParam('view', v === 'cards' ? null : v)} storageKey={`view:events:${user?.id ?? 'anon'}`} />
        {filtered && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>
        )}
      </div>

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
