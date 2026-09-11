import type { QueryClient } from '@tanstack/react-query';

/**
 * Collapses a burst of socket events into a bounded number of refetches.
 *
 * React Query already dedupes refetches that are *concurrent*, so events landing inside one
 * request's flight collapse on their own. What it doesn't collapse is a stream spaced further
 * apart than that — someone dragging six cards across a board, or a bulk verify emitting one
 * event per row, produces one full list refetch each. On a list query that's a real payload every
 * time, and the intermediate results are thrown away by the next one anyway.
 *
 * Leading edge fires immediately so a single event still feels instant; anything arriving during
 * the window is folded into one trailing refetch when it closes.
 */
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
    // Must be called from the effect's cleanup: without it a trailing refetch can fire against a
    // QueryClient the unmounting tree no longer uses, and on sign-out that re-populates caches
    // logout() has just purged.
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = false;
    },
  };
};
