import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '../api/http';
import { haptic } from './haptics';

const OFFLINE_MESSAGE = "You're offline. Check your connection and try again.";

const TECHNICAL_TEXT =
  /error:|status code|request failed|failed to fetch|networkerror|\bat\s.+\(|\bundefined\b|\bnull\b|\[object|econn|enotfound|etimedout|typeerror|syntaxerror|prisma|\bsql\b|\bstack\b|exception|\bjson\b|<\/?\w+>|[{}]/i;

const isHumanMessage = (message: unknown): message is string => {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  return text.length > 0 && text.length < 160 && !/[\r\n]/.test(text) && !TECHNICAL_TEXT.test(text);
};

const isOfflineError = (err: unknown): boolean =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) ||
  err instanceof TypeError ||
  (err instanceof ApiError && err.status === 0);

function mapApiError(err: unknown, fallback: string): string {
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
        if (err.status >= 400 && err.status < 500 && serverText) return serverText;
        return fallback;
    }
  }
  return serverText ?? fallback;
}

export const errorMessage = (err: unknown, fallback: string): string => mapApiError(err, fallback);

const retryCanHelp = (err: unknown): boolean =>
  !(err instanceof ApiError) || err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;

type NotifyErrorOptions = {
  retry?: () => void;
  format?: (message: string, ctx: { offline: boolean }) => string;
  persistent?: boolean;
  id?: string | number;
};

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

export const handleQueryRetry = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) return false;
  return failureCount < 3;
};

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15_000;

export const queryRetryDelay = (failureCount: number, error: unknown): number => {
  const asked = error instanceof ApiError ? error.retryAfterMs : undefined;
  const base = asked ?? Math.min(RETRY_BASE_MS * 2 ** failureCount, RETRY_MAX_MS);
  return Math.round(base * (0.5 + Math.random()));
};

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
  keyPrefixes: readonly (readonly unknown[])[];
  apply: (vars: TVars) => (old: unknown) => unknown;
};

type QueryEntry = readonly [readonly unknown[], unknown];
type OptimisticContext = { snapshots: (readonly [readonly unknown[], QueryEntry[]])[] } | undefined;

type EntityMutationConfig<TVars, TResult> = {
  mutationFn: (vars: TVars) => Promise<TResult>;
  invalidateKeys: readonly (readonly unknown[])[];
  setDetailData?: (result: TResult, vars: TVars) => { key: readonly unknown[]; data: TResult } | void;
  removeKey?: (result: TResult, vars: TVars) => readonly unknown[] | void;
  successMessage?: string | ((result: TResult, vars: TVars) => string) | null;
  errorFallback: string;
  errorToast?: boolean;
  retryable?: boolean;
  optimisticUpdate?: OptimisticUpdate<TVars>;
};

const ANALYTICS_SOURCE_KEYS = ['tickets', 'tasks', 'checklist-instances'];

export const SCORE_CACHE_KEYS: readonly (readonly string[])[] = [
  ['scores'],
  ['checklist-report'],
  ['checklist-reports'],
  ['checklist-report-preview'],
  ['team'],
  ['exceptions'],
];

export const invalidateScoreCaches = (queryClient: QueryClient): Promise<void> =>
  Promise.all(SCORE_CACHE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(() => undefined);

const invalidatesAnalytics = (invalidateKeys: readonly (readonly unknown[])[]) =>
  invalidateKeys.some((key) => ANALYTICS_SOURCE_KEYS.includes(key[0] as string));

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
  useEffect(() => { mutateRef.current = mutation.mutate; }, [mutation.mutate]);
  return mutation;
}
