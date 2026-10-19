import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { connectSocket, releaseSocket } from '../../lib/socket';
import { createCoalescedInvalidator, createScoreCacheInvalidator } from '../../lib/coalescedInvalidate';

export const useChecklistSocket = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const socket = connectSocket(token);
    const definitions = createCoalescedInvalidator(queryClient, ['checklist-definitions']);
    const instances = createCoalescedInvalidator(queryClient, ['checklist-instances']);
    const analytics = createCoalescedInvalidator(queryClient, ['analytics']);
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
