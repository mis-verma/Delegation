import type { QueryClient } from '@tanstack/react-query';
import { SCORE_CACHE_KEYS } from './queryHelpers';

export const createCoalescedInvalidator = (
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  waitMs = 300,
) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  const fire = () => {
    queryClient.invalidateQueries({ queryKey });
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      pending = false;
      fire();
    }, waitMs);
  };

  return {
    schedule: () => {
      if (timer) {
        pending = true;
        return;
      }
      fire();
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = false;
    },
  };
};

export const createScoreCacheInvalidator = (queryClient: QueryClient, waitMs = 300) => {
  const parts = SCORE_CACHE_KEYS.map((key) => createCoalescedInvalidator(queryClient, key, waitMs));
  return {
    schedule: () => parts.forEach((p) => p.schedule()),
    cancel: () => parts.forEach((p) => p.cancel()),
  };
};
