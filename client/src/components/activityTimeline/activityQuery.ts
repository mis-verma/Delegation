import { activityApi, type ActivityEntity } from '../../api/activity';

export const activityQueryOptions = (entityType: ActivityEntity, entityId: string) => ({
  queryKey: ['activity', entityType, entityId] as const,
  queryFn: () => activityApi.get(entityType, entityId),
  staleTime: 30_000,
});
