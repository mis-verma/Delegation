import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

export type DecisionKind = 'checklist' | 'ticket' | 'task';

export const QUEUE_KEY: Record<DecisionKind, QueryKey> = {
  checklist: ['checklist-instances', 'pending-verification'],
  ticket: ['tickets', 'by-status', 'PENDING_APPROVAL'],
  task: ['tasks', 'verification-queue'],
};

export const ROOT_KEY: Record<DecisionKind, string> = {
  checklist: 'checklist-instances',
  ticket: 'tickets',
  task: 'tasks',
};

type Identified = { id: string };
type ListPage = { data: Identified[]; meta?: { total?: number } & Record<string, unknown> } & Record<string, unknown>;
type FlatList = { data: Identified[]; total: number };

const startsWith = (key: QueryKey, prefix: QueryKey) => prefix.every((part, i) => key[i] === part);

export const isQueueKey = (key: QueryKey): boolean => Object.values(QUEUE_KEY).some((prefix) => startsWith(key, prefix));

export const dropDecided = (queryClient: QueryClient, kind: DecisionKind, ids: readonly string[]) => {
  if (ids.length === 0) return;
  const drop = new Set(ids);
  if (kind === 'checklist') {
    queryClient.setQueriesData<InfiniteData<ListPage>>({ queryKey: QUEUE_KEY.checklist }, (old) => {
      if (!old?.pages) return old;
      const removed = old.pages.reduce((n, page) => n + page.data.filter((i) => drop.has(i.id)).length, 0);
      if (removed === 0) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.filter((i) => !drop.has(i.id)),
          meta: page.meta ? { ...page.meta, total: Math.max(0, (page.meta.total ?? 0) - removed) } : page.meta,
        })),
      };
    });
    return;
  }
  queryClient.setQueriesData<FlatList>({ queryKey: QUEUE_KEY[kind] }, (old) => {
    if (!old?.data) return old;
    const data = old.data.filter((i) => !drop.has(i.id));
    return data.length === old.data.length ? old : { ...old, data, total: Math.max(0, old.total - (old.data.length - data.length)) };
  });
};
