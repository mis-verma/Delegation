import { useState, lazy, Suspense } from 'react';
import { Plus, Trash2, Pencil, CalendarClock, Clock3, Loader2 } from 'lucide-react';
import { Button, Skeleton, GradientIconTile, IconChip } from '../../components';
import { useAuth } from '@/context/AuthContext';
import { useEventsQuery, useDeleteEventMutation } from './hook';
import { EVENT_TYPE_LABELS, EVENT_TYPE_SOLID, EVENT_TYPE_GRADIENT, EVENT_TYPE_ICONS } from './eventDisplay';
import { ErrorMessage, EmptyState } from '../admin/adminDisplay';
import type { Event } from '@/api/events';

const EventForm = lazy(() =>
  import('./EventForm').then(module => ({ default: module.EventForm }))
);

export const EventList = () => {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'PC';

  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const { data: events = [], isPending, isError } = useEventsQuery();
  const deleteMut = useDeleteEventMutation();

  const closeForm = () => {
    setShowForm(false);
    setEditingEvent(null);
  };

  const renderContent = () => {
    if (isPending) return <EventListSkeleton />;
    if (isError) return <ErrorMessage message="Failed to load events." />;
    if (events.length === 0) {
      return <EmptyState label="No events yet — deadlines, announcements, and broadcasts will show up here." Icon={CalendarClock} />;
    }

    return (
      <div className="flex flex-col gap-2">
        {events.map(e => {
          const Icon = EVENT_TYPE_ICONS[e.type];
          const isDeleting = deleteMut.isPending && deleteMut.variables === e.id;

          return (
            <div
              key={e.id}
              className={`flex items-center gap-3.5 p-4 rounded-xl border border-border bg-surface hover:border-border-hover transition-all duration-200 ${
                isDeleting ? 'opacity-40 pointer-events-none' : ''
              }`}
            >
              <div
                className="flex items-center justify-center size-10 rounded-xl shrink-0 text-white ring-1 ring-inset ring-white/20"
                style={{ background: EVENT_TYPE_GRADIENT[e.type] }}
              >
                <Icon size={18} strokeWidth={2.25} />
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <p className="text-sm font-display font-semibold text-text truncate">{e.title}</p>
                {e.description && (
                  <p className="text-xs text-text-muted font-display truncate">{e.description}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <IconChip icon={Icon} tone={EVENT_TYPE_SOLID[e.type]} label={EVENT_TYPE_LABELS[e.type]} />
                  <span className="inline-flex items-center gap-1 text-[11px] font-display font-medium text-text-muted">
                    <Clock3 size={11} className="shrink-0" />
                    {new Date(e.eventDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
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
          );
        })}
      </div>
    );
  };

  const activeModal = showForm || editingEvent;

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto pb-10">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <GradientIconTile icon={CalendarClock} />
          <div>
            <h1 className="text-xl font-display font-bold text-text">Events</h1>
            <p className="text-sm text-text-muted mt-0.5">
              Deadlines, announcements, and broadcasts for everyone
            </p>
          </div>
        </div>
        {canManage && (
          <Button size="sm" variant="primary" className="gap-1.5" onClick={() => setShowForm(true)}>
            <Plus size={14} />
            New event
          </Button>
        )}
      </div>

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
  <div className="flex flex-col gap-2">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3.5 p-4 rounded-xl border border-border bg-surface">
        <Skeleton className="size-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <Skeleton className="h-4 max-w-56" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
    ))}
  </div>
);
