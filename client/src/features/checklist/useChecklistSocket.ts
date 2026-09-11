import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { connectSocket, releaseSocket } from '../../lib/socket';
import { createCoalescedInvalidator } from '../../lib/coalescedInvalidate';

/**
 * Keeps the Checklist Templates grid, My Checklists, and the compliance board live — same posture
 * as useTaskSocket/useTicketSocket (invalidate rather than patch the cache by hand, coalesced so a
 * burst of events costs one refetch per window). Checklist instances/definitions had no socket
 * events at all before this — every one of those pages only ever updated on a manual refresh or
 * whatever refetch interval the query happened to have, unlike Tasks/Tickets which have pushed
 * live for a while.
 */
export const useChecklistSocket = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const socket = connectSocket(token);
    const definitions = createCoalescedInvalidator(queryClient, ['checklist-definitions']);
    const instances = createCoalescedInvalidator(queryClient, ['checklist-instances']);
    // Admin analytics (OrgOverview) reads its audit/compliance numbers from real checklist-instance
    // aggregates — without this, an instance completing live left those stale until remount/refocus.
    const analytics = createCoalescedInvalidator(queryClient, ['analytics']);
    const invalidateDefinitions = () => definitions.schedule();
    const invalidateInstances = () => { instances.schedule(); analytics.schedule(); };

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
      // releaseSocket() only — shared, refcounted socket (see socket.ts). Disconnecting outright
      // here would tear it down for the task/ticket/notification hooks too.
      releaseSocket();
    };
  }, [token, queryClient]);
};
