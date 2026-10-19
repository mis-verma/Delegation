import { useCallback, useMemo } from 'react';
import { useAssignableUsersQuery } from '../../hook';

export interface StorePeople {
  storePersonIds: ReadonlySet<string> | null;
  activePersonIds: ReadonlySet<string> | null;
  isReady: boolean;
  refetch: () => void;
}

export const useStorePeople = (storeIds: string[]): StorePeople => {
  const storeQuery = useAssignableUsersQuery(undefined, undefined, storeIds, storeIds.length > 0);
  const activeQuery = useAssignableUsersQuery();
  const storeData = storeQuery.data;
  const activeData = activeQuery.data;
  const storePersonIds = useMemo(
    () => (storeIds.length > 0 && storeData ? new Set(storeData.map((u) => u.id)) : null),
    [storeIds.length, storeData],
  );
  const activePersonIds = useMemo(() => (activeData ? new Set(activeData.map((u) => u.id)) : null), [activeData]);
  const isReady = (storeIds.length === 0 || storeQuery.isSuccess) && activeQuery.isSuccess;
  const refetchStore = storeQuery.refetch;
  const refetchActive = activeQuery.refetch;
  const hasStores = storeIds.length > 0;
  const refetch = useCallback(() => {
    if (hasStores) void refetchStore();
    void refetchActive();
  }, [hasStores, refetchStore, refetchActive]);
  return { storePersonIds, activePersonIds, isReady, refetch };
};

export const peopleCount = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

export const splitByVisible = (ids: string[], visible: ReadonlySet<string> | null) => {
  if (!visible) return { shown: ids, hidden: [] as string[] };
  const shown: string[] = [];
  const hidden: string[] = [];
  for (const id of ids) (visible.has(id) ? shown : hidden).push(id);
  return { shown, hidden };
};
