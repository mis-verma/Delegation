import { useMemo } from 'react';
import { useAssignableUsersQuery } from '../../hook';

export interface StorePeople {
  /** Active people of the selected stores, the only ones the pickers list. null while loading, or
   *  when no store is picked yet (nothing to compare against, so nobody counts as hidden). */
  storePersonIds: ReadonlySet<string> | null;
  /** Every active person in the organisation. null while loading. */
  activePersonIds: ReadonlySet<string> | null;
}

// The two lists the builder compares picked people against. A person picked for a store that was
// later unticked (or who has since been deactivated) stays in the form's state but disappears from
// every picker, so each step needs to know who is still visible.
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
  return { storePersonIds, activePersonIds };
};

export const peopleCount = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** Splits picked ids into the ones the pickers still show and the ones they no longer do. */
export const splitByVisible = (ids: string[], visible: ReadonlySet<string> | null) => {
  if (!visible) return { shown: ids, hidden: [] as string[] };
  const shown: string[] = [];
  const hidden: string[] = [];
  for (const id of ids) (visible.has(id) ? shown : hidden).push(id);
  return { shown, hidden };
};
