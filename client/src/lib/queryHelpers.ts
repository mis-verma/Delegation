import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '../api/http';

// Shared by every feature's hook.ts — was previously copy-pasted identically in
// features/tickets/hook.ts and features/tasks/hook.ts.
export const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

// Stops React Query from retrying a query on any 4xx (401 unauthenticated, 403 forbidden, 404 not
// found, etc.) — retrying doesn't fix "you're not allowed" or "this doesn't exist any more," it
// just fires the same doomed request 3x in a row (e.g. a deleted checklist's detail page hammering
// GET /checklist-definitions/:id 3 times before giving up, instead of failing on the first try).
// Only network errors and 5xx (genuinely transient) are worth retrying. Pass as a query's `retry`.
export const handleQueryRetry = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 3;
};

// Patches the entity with matching `id` inside any cached shape this app uses: a lone entity, a
// plain array of entities, or a `{ data: T[] }` paginated wrapper (see PaginatedResponse in
// api/ticket.ts etc.). Falls through unchanged for shapes/ids that don't match. Used as the
// optimistic updater for mutations below so one patch covers the list, board, and detail caches
// at once regardless of how each happens to be shaped.
export function patchEntityInCache<T extends { id: string }>(old: unknown, id: string, patch: Partial<T>): unknown {
  if (old == null) return old;
  if (Array.isArray(old)) {
    return (old as T[]).map((item) => (item?.id === id ? { ...item, ...patch } : item));
  }
  if (typeof old === 'object') {
    const obj = old as Record<string, unknown> & { id?: string; data?: unknown };
    if (obj.id === id) return { ...obj, ...patch };
    if (Array.isArray(obj.data)) return { ...obj, data: patchEntityInCache(obj.data, id, patch) };
  }
  return old;
}

type OptimisticUpdate<TVars> = {
  // Query key prefixes whose matching cached queries should be optimistically patched, e.g.
  // [['tickets']] matches every ticket list/board/detail query however each is parameterized.
  keyPrefixes: readonly (readonly unknown[])[];
  // Given the mutation's vars, returns the updater applied to every matching cached query.
  apply: (vars: TVars) => (old: unknown) => unknown;
};

type QueryEntry = readonly [readonly unknown[], unknown]; // [queryKey, cached data]
type OptimisticContext = { snapshots: (readonly [readonly unknown[], QueryEntry[]])[] } | undefined;

type EntityMutationConfig<TVars, TResult> = {
  mutationFn: (vars: TVars) => Promise<TResult>;
  // Query keys to invalidate on success, e.g. [['tickets'], KEYS.detail(ticketId)].
  invalidateKeys: readonly (readonly unknown[])[];
  // Write the mutation result straight into a detail-cache entry instead of waiting on a
  // refetch — used by update/verify mutations that return the full updated entity.
  setDetailData?: (result: TResult, vars: TVars) => { key: readonly unknown[]; data: TResult } | void;
  // Drop a cache entry entirely — used by delete mutations, where `vars` is usually the id.
  removeKey?: (result: TResult, vars: TVars) => readonly unknown[] | void;
  // null/omitted = no success toast (e.g. checkbox-toggle mutations that should feel instant).
  successMessage?: string | ((result: TResult, vars: TVars) => string) | null;
  errorFallback: string;
  // Default true. Set false when the caller shows the failure itself, next to the field or button
  // that failed, so the same message doesn't also pop up as a toast.
  errorToast?: boolean;
  // Patch the cache immediately, before the server responds, so the UI reflects the change with
  // no perceptible wait — checkbox toggles, drag-drop status moves, etc. Rolled back on error.
  optimisticUpdate?: OptimisticUpdate<TVars>;
};

// Root query keys whose data an admin analytics report is built from — every stat card, gauge,
// ranking table and leaderboard on OrgOverview ultimately reads a ticket/task/checklist-instance
// aggregate. None of those mutations used to touch the `['analytics', ...]` cache at all, so
// closing a ticket, completing a delegation, or approving a checklist instance while the overview
// page was open left every number on it stale until the page remounted or regained focus.
const ANALYTICS_SOURCE_KEYS = ['tickets', 'tasks', 'checklist-instances'];

// Every cache that holds a score, rate or report figure. Singular and plural report keys both exist
// ('checklist-report' = Team Overview, 'checklist-reports', 'checklist-report-preview'), so all are
// listed: a finished, approved or sent-back item moves numbers in each of them.
export const SCORE_CACHE_KEYS: readonly (readonly string[])[] = [
  ['scores'],
  ['checklist-report'],
  ['checklist-reports'],
  ['checklist-report-preview'],
  ['team'],
];

export const invalidateScoreCaches = (queryClient: QueryClient): Promise<void> =>
  Promise.all(SCORE_CACHE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(() => undefined);

const invalidatesAnalytics = (invalidateKeys: readonly (readonly unknown[])[]) =>
  invalidateKeys.some((key) => ANALYTICS_SOURCE_KEYS.includes(key[0] as string));

// The shape behind nearly every ticket/task mutation in this app: run mutationFn, then on
// success update/invalidate the relevant caches and optionally toast, or toast an error message
// on failure. Extracted so each feature's hook.ts stops re-implementing the same onSuccess/
// onError wiring for every single mutation.
export function useEntityMutation<TVars, TResult>(config: EntityMutationConfig<TVars, TResult>) {
  const queryClient = useQueryClient();

  return useMutation<TResult, unknown, TVars, OptimisticContext>({
    mutationFn: config.mutationFn,
    onMutate: async (vars) => {
      const opt = config.optimisticUpdate;
      if (!opt) return undefined;

      await Promise.all(opt.keyPrefixes.map((key) => queryClient.cancelQueries({ queryKey: key })));
      const snapshots = opt.keyPrefixes.map(
        (key) => [key, queryClient.getQueriesData({ queryKey: key })] as const,
      );
      const updater = opt.apply(vars);
      opt.keyPrefixes.forEach((key) => queryClient.setQueriesData({ queryKey: key }, updater));
      return { snapshots };
    },
    onSuccess: (result, vars) => {
      const detail = config.setDetailData?.(result, vars);
      if (detail) queryClient.setQueryData(detail.key, detail.data);

      const removed = config.removeKey?.(result, vars);
      if (removed) queryClient.removeQueries({ queryKey: removed });

      config.invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      if (invalidatesAnalytics(config.invalidateKeys)) {
        queryClient.invalidateQueries({ queryKey: ['analytics'] });
        invalidateScoreCaches(queryClient);
        // Every one of these writes an audit row, so an open detail sheet's Activity section
        // should show the change right away rather than on the next remount.
        queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      }

      if (config.successMessage != null) {
        const msg = typeof config.successMessage === 'function'
          ? config.successMessage(result, vars)
          : config.successMessage;
        toast.success(msg);
      }
    },
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([, entries]) => {
        entries.forEach(([entryKey, data]) => queryClient.setQueryData(entryKey, data));
      });
      if (config.errorToast !== false) toast.error(errorMessage(err, config.errorFallback));
    },
  });
}
