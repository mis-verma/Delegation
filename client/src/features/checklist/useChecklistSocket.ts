import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { connectSocket, releaseSocket } from '../../lib/socket';
import { createCoalescedInvalidator, createScoreCacheInvalidator, HEAVY_REFRESH, LIST_REFRESH } from '../../lib/coalescedInvalidate';

export const useChecklistSocket = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const socket = connectSocket(token);
    const definitions = createCoalescedInvalidator(queryClient, ['checklist-definitions'], LIST_REFRESH.waitMs, LIST_REFRESH.jitterMs);
    const instances = createCoalescedInvalidator(queryClient, ['checklist-instances'], LIST_REFRESH.waitMs, LIST_REFRESH.jitterMs);
    const analytics = createCoalescedInvalidator(queryClient, ['analytics'], HEAVY_REFRESH.waitMs, HEAVY_REFRESH.jitterMs);
    const scores = createScoreCacheInvalidator(queryClient);
    const invalidateDefinitions = () => definitions.schedule();
    const invalidateInstances = () => { instances.schedule(); analytics.schedule(); scores.schedule(); };

    const definitionEvents = [
      'checklist-definition:created',
      'checklist-definition:updated',
      'checklist-definition:deleted',
    ] as const;
    const instanceEvents = [
      'checklist-instance:created',
      'checklist-instance:updated',
    ] as const;

    definitionEvents.forEach((event) => socket.on(event, invalidateDefinitions));
    instanceEvents.forEach((event) => socket.on(event, invalidateInstances));

    return () => {
      definitionEvents.forEach((event) => socket.off(event, invalidateDefinitions));
      instanceEvents.forEach((event) => socket.off(event, invalidateInstances));
      definitions.cancel();
      instances.cancel();
      analytics.cancel();
      scores.cancel();
      releaseSocket();
    };
  }, [token, queryClient]);
};
