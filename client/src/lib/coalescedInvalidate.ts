import type { QueryClient } from '@tanstack/react-query';
import { SCORE_CACHE_KEYS } from './queryHelpers';

export const LIST_REFRESH = { waitMs: 300, jitterMs: 1000 } as const;
export const HEAVY_REFRESH = { waitMs: 3000, jitterMs: 3000 } as const;

export const createCoalescedInvalidator = (
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  waitMs = 300,
  jitterMs = 0,
) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let leading = false;
  let pending = false;

  const spread = () => (jitterMs > 0 ? Math.random() * jitterMs : 0);

  const fire = () => {
    queryClient.invalidateQueries({ queryKey });
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      pending = false;
      fire();
    }, waitMs + spread());
  };

  return {
    schedule: () => {
      if (leading) return;
      if (timer) {
        pending = true;
        return;
      }
      if (jitterMs <= 0) {
        fire();
        return;
      }
      leading = true;
      timer = setTimeout(() => {
        leading = false;
        fire();
      }, spread());
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      leading = false;
      pending = false;
    },
  };
};

export const createScoreCacheInvalidator = (queryClient: QueryClient, waitMs = HEAVY_REFRESH.waitMs, jitterMs = HEAVY_REFRESH.jitterMs) => {
  const parts = SCORE_CACHE_KEYS.map((key) => createCoalescedInvalidator(queryClient, key, waitMs, jitterMs));
  return {
    schedule: () => parts.forEach((p) => p.schedule()),
    cancel: () => parts.forEach((p) => p.cancel()),
  };
};
