import { activityApi, type ActivityEntity } from '../../api/activity';

// Shared by ActivityFeed and the ticket card's hover prefetch, so opening a ticket finds its
// activity already loaded.
export const activityQueryOptions = (entityType: ActivityEntity, entityId: string) => ({
  queryKey: ['activity', entityType, entityId] as const,
  queryFn: () => activityApi.get(entityType, entityId),
  staleTime: 30_000,
});
