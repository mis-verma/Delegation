import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { eventApi, type CreateEventPayload, type UpdateEventPayload } from '@/api/events';
import { useEntityMutation, handleQueryRetry } from '../../lib/queryHelpers';

const EVENT_KEY = {
  all: ['events'] as const,
  upcoming: (limit: number) => ['events', 'upcoming', limit] as const,
};

// Shared with the route prefetch so a hover on Events or Calendar and the page itself use one entry.
export const eventsQueryOptions = () => ({
  queryKey: EVENT_KEY.all,
  queryFn: () => eventApi.getAll().then(r => r.data),
});

export const useEventsQuery = () => {
  const { token } = useAuth();
  return useQuery({
    ...eventsQueryOptions(),
    enabled: !!token,
    retry: handleQueryRetry,
  });
};

export const useCreateEventMutation = () => useEntityMutation({
  mutationFn: (payload: CreateEventPayload) => eventApi.create(payload).then(r => r.data),
  invalidateKeys: [EVENT_KEY.all],
  successMessage: 'Event created',
  errorFallback: 'Failed to create event',
});

export const useUpdateEventMutation = () => useEntityMutation({
  mutationFn: ({ id, payload }: { id: string; payload: UpdateEventPayload }) =>
    eventApi.update(id, payload).then(r => r.data),
  invalidateKeys: [EVENT_KEY.all],
  successMessage: 'Event updated',
  errorFallback: 'Failed to update event',
});

export const useDeleteEventMutation = () => useEntityMutation({
  mutationFn: (id: string) => eventApi.delete(id),
  invalidateKeys: [EVENT_KEY.all],
  successMessage: 'Event deleted',
  errorFallback: 'Failed to delete event',
});
