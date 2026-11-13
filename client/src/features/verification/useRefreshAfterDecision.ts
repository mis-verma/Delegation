import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateScoreCaches } from '../../lib/queryHelpers';
import { QUEUE_KEY, ROOT_KEY, dropDecided, isQueueKey, type DecisionKind } from './decisionCache';

const QUEUE_SYNC_AFTER_MS = 20_000;

export interface DecisionTarget {
  id: string;
  kind?: DecisionKind;
}

export const useRefreshAfterDecision = () => {
  const queryClient = useQueryClient();
  const syncTimers = useRef(new Map<DecisionKind, number>());

  useEffect(() => {
    const timers = syncTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const scheduleQueueSync = useCallback((kind: DecisionKind) => {
    const timers = syncTimers.current;
    window.clearTimeout(timers.get(kind));
    timers.set(kind, window.setTimeout(() => {
      timers.delete(kind);
      void queryClient.refetchQueries({ queryKey: QUEUE_KEY[kind], type: 'active' });
    }, QUEUE_SYNC_AFTER_MS));
  }, [queryClient]);

  const markOthersStale = useCallback(() => {
    void Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['analytics'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['audit-logs'], refetchType: 'none' }),
      invalidateScoreCaches(queryClient),
    ]);
  }, [queryClient]);

  return useCallback(async (target?: DecisionTarget | DecisionTarget[]) => {
    const targets = (Array.isArray(target) ? target : target ? [target] : []).filter((t): t is Required<DecisionTarget> => !!t.kind);
    markOthersStale();
    if (targets.length === 0) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['checklist-instances'] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ]);
      return;
    }
    const kinds = [...new Set(targets.map((t) => t.kind))];
    for (const kind of kinds) dropDecided(queryClient, kind, targets.filter((t) => t.kind === kind).map((t) => t.id));
    await Promise.allSettled(kinds.flatMap((kind) => [
      queryClient.invalidateQueries({ queryKey: QUEUE_KEY[kind], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: [ROOT_KEY[kind]], predicate: (q) => !isQueueKey(q.queryKey) }),
    ]));
    for (const kind of kinds) scheduleQueueSync(kind);
  }, [queryClient, markOthersStale, scheduleQueueSync]);
};
