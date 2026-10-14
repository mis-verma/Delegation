import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '../api/http';
import { haptic } from './haptics';

const OFFLINE_MESSAGE = "You're offline. Check your connection and try again.";

// A server or thrown message is safe to show only when it reads like a short plain sentence:
// no "Error:" prefixes, status-code talk, stack text, or code-ish words.
const TECHNICAL_TEXT =
  /error:|status code|request failed|failed to fetch|networkerror|\bat\s.+\(|\bundefined\b|\bnull\b|\[object|econn|enotfound|etimedout|typeerror|syntaxerror|prisma|\bsql\b|\bstack\b|exception|\bjson\b|<\/?\w+>|[{}]/i;

export const isHumanMessage = (message: unknown): message is string => {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  return text.length > 0 && text.length < 160 && !/[\r\n]/.test(text) && !TECHNICAL_TEXT.test(text);
};

/** True when the failure is the phone having no connection (nothing reached the server). */
export const isOfflineError = (err: unknown): boolean =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) ||
  err instanceof TypeError ||
  (err instanceof ApiError && err.status === 0);

/**
 * Turns any failure into one plain sentence for the person. Never returns raw technical text.
 * `fallback` should read "Couldn't <do the thing>. Try again." and is used for server faults (5xx)
 * and anything unrecognised. Pure, so it can be unit tested on its own.
 */
export function mapApiError(err: unknown, fallback: string): string {
  if (isOfflineError(err)) return OFFLINE_MESSAGE;

  const serverText = err instanceof Error && isHumanMessage(err.message) ? err.message.trim() : null;

  if (err instanceof ApiError) {
    switch (err.status) {
      case 401: return "You've been signed out. Sign in again.";
      case 403: return serverText ?? "You can't do this. Ask your manager or admin.";
      case 404: return 'This was deleted or moved.';
      case 409: return serverText ?? 'Someone just changed this. Reload to see the latest.';
      case 413: return 'This file is too large. Try a smaller one.';
      case 429: return 'Too many tries. Wait a moment and try again.';
      default:
        // Other 4xx (bad input) carry a useful human sentence; 5xx never do.
        if (err.status >= 400 && err.status < 500 && serverText) return serverText;
        return fallback;
    }
  }
  // A plain Error thrown by our own client code (validation, "pick a file first" and so on).
  return serverText ?? fallback;
}

// Kept under its old name: every caller already passes a "Couldn't ..." fallback.
export const errorMessage = (err: unknown, fallback: string): string => mapApiError(err, fallback);

// Retrying only helps when the cause was temporary: no connection, a busy or broken server.
const retryCanHelp = (err: unknown): boolean =>
  !(err instanceof ApiError) || err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;

type NotifyErrorOptions = {
  /** Adds a Retry button to the toast that runs this. Hidden when retrying cannot help (403, 404...). */
  retry?: () => void;
  /** Rewrites the final message, e.g. to prefix "Not saved." */
  format?: (message: string, ctx: { offline: boolean }) => string;
  /** Keeps the toast up until dismissed. Pair with `id` so repeats replace each other. */
  persistent?: boolean;
  id?: string | number;
};

/** The one way to tell the person something failed: error buzz, plain message, optional Retry. */
export function notifyError(err: unknown, fallback: string, options: NotifyErrorOptions = {}): void {
  haptic('error');
  const mapped = mapApiError(err, fallback);
  const message = options.format ? options.format(mapped, { offline: isOfflineError(err) }) : mapped;
  toast.error(message, {
    id: options.id,
    duration: options.persistent ? Infinity : undefined,
    closeButton: options.persistent ? true : undefined,
    action: options.retry && retryCanHelp(err) ? { label: 'Retry', onClick: options.retry } : undefined,
  });
}

// Stops React Query from retrying a query on any 4xx (401 unauthenticated, 403 forbidden, 404 not
// found, etc.) — retrying doesn't fix "you're not allowed" or "this doesn't exist any more," it
// just fires the same doomed request 3x in a row (e.g. a deleted checklist's detail page hammering
// GET /checklist-definitions/:id 3 times before giving up, instead of failing on the first try).
// Only network errors, 5xx, 408 (request timeout) and 429 (rate limited) are worth retrying: those
// are all "try again in a moment" (same set as retryCanHelp above). Pass as a query's `retry`; it is
// also the app-wide default (main.tsx).
export const handleQueryRetry = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) return false;
  return failureCount < 3;
};

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15_000;

// How long to wait before the next try: the server's Retry-After when it sent one, otherwise
// exponential (1s, 2s, 4s ...) up to 15s. Either way spread by +/-50% so a thousand clients that all
// failed together do not all come back in the same instant and fail together again.
// Pass as a query's `retryDelay`; it is the app-wide default (main.tsx).
export const queryRetryDelay = (failureCount: number, error: unknown): number => {
  const asked = error instanceof ApiError ? error.retryAfterMs : undefined;
  const base = asked ?? Math.min(RETRY_BASE_MS * 2 ** failureCount, RETRY_MAX_MS);
  return Math.round(base * (0.5 + Math.random()));
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
  // Default false. True for fast single-tap actions (tick, move, approve) so the error toast offers
  // Retry, which re-runs the same call with the same variables. Not for create/edit forms: they show
  // their own error next to a Save button.
  retryable?: boolean;
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
  const mutateRef = useRef<((vars: TVars) => void) | null>(null);

  const mutation = useMutation<TResult, unknown, TVars, OptimisticContext>({
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
        haptic('success');
      }
    },
    onError: (err, vars, context) => {
      context?.snapshots.forEach(([, entries]) => {
        entries.forEach(([entryKey, data]) => queryClient.setQueryData(entryKey, data));
      });
      if (config.errorToast !== false) {
        notifyError(err, config.errorFallback, {
          retry: config.retryable ? () => mutateRef.current?.(vars) : undefined,
        });
      } else {
        haptic('error');
      }
    },
  });
  // `mutate` is stable, so the Retry button can call it later with the failed call's variables.
  useEffect(() => { mutateRef.current = mutation.mutate; }, [mutation.mutate]);
  return mutation;
}
