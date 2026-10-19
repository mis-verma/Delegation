import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { checklistInstanceApi, type ChecklistInstance } from '../../api/checklistInstances';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { instanceDeadline } from '../checklist/checklistDisplay';
import { useDepartmentsQuery, useStoresQuery, useAssignableUsersQuery } from '../tickets/hook';
import {
  ALL, DAY_MS, UNASSIGNED, computeRisk, sortChecklistRows, waitingSinceOf,
  type ChecklistRow, type SortKey, type AgeFilter,
} from './verificationModel';

const CHECKLIST_PAGE_SIZE = 50;
const STALE_MS = 30_000;

export const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};

export const useChecklistQueueQuery = () => {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['checklist-instances', 'pending-verification', CHECKLIST_PAGE_SIZE],
    queryFn: ({ pageParam }) => checklistInstanceApi.getPendingVerification({ page: pageParam, limit: CHECKLIST_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta?.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: !!token,
    retry: handleQueryRetry,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
};

export interface QueueLookups {
  stores: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  people: { id: string; name: string; departmentId: string | null }[];
}

export const useQueueLookups = (): QueueLookups => {
  const { data: storesData } = useStoresQuery();
  const { data: departmentsData } = useDepartmentsQuery();
  const { data: peopleData } = useAssignableUsersQuery();
  const stores = useMemo(
    () => [...(storesData ?? [])].map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [storesData],
  );
  const departments = useMemo(
    () => [...(departmentsData ?? [])].map((d) => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [departmentsData],
  );
  const people = useMemo(
    () => (peopleData ?? [])
      .map((p) => ({ id: p.id, name: `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}`, departmentId: p.departmentId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [peopleData],
  );
  return useMemo(() => ({ stores, departments, people }), [stores, departments, people]);
};

export const useChecklistRows = (instances: ChecklistInstance[], lookups: QueueLookups): ChecklistRow[] =>
  useMemo(() => {
    const storeById = new Map(lookups.stores.map((s) => [s.id, s.name]));
    const deptById = new Map(lookups.departments.map((d) => [d.id, d.name]));
    const personById = new Map(lookups.people.map((p) => [p.id, p]));
    return instances.map((instance): ChecklistRow => {
      const assignees = instance.assigneeIds.map((id) => personById.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
      const deptIds = [...new Set(assignees.map((p) => p.departmentId).filter((d): d is string => !!d))];
      const storeName = storeById.get(instance.storeId) ?? null;
      const assigneeNames = assignees.map((p) => p.name);
      const deptName = deptIds.length
        ? deptIds.map((id) => deptById.get(id) ?? 'Unknown department').join(', ')
        : 'No department';
      return {
        id: instance.id,
        instance,
        risk: computeRisk(instance),
        waitingSince: waitingSinceOf(instance),
        deadline: instanceDeadline(instance),
        deptIds: deptIds.length ? deptIds : [UNASSIGNED],
        deptName,
        storeName,
        assigneeNames,
        haystack: [instance.title, storeName, instance.submittedByName, ...assigneeNames].filter(Boolean).join(' ').toLowerCase(),
      };
    });
  }, [instances, lookups]);

export interface ChecklistFilters {
  q: string;
  store: string | null;
  dept: string | null;
  person: string | null;
  age: AgeFilter;
  attention: boolean;
  sort: SortKey;
}

export const useVisibleChecklistRows = (
  rows: ChecklistRow[],
  filters: ChecklistFilters,
  hiddenIds: ReadonlySet<string>,
  now: number,
): ChecklistRow[] => {
  const { q, store, dept, person, age, attention, sort } = filters;
  return useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cutoff = age === 'any' ? null : now - Number(age) * DAY_MS;
    const kept = rows.filter((r) =>
      !hiddenIds.has(r.id) &&
      (!store || store === ALL || r.instance.storeId === store) &&
      (!dept || r.deptIds.includes(dept)) &&
      (!person || r.instance.assigneeIds.includes(person) || r.instance.submittedBy === person) &&
      (cutoff == null || r.waitingSince <= cutoff) &&
      (!attention || r.risk.needsAttention) &&
      (!needle || r.haystack.includes(needle)),
    );
    return sortChecklistRows(kept, sort);
  }, [rows, hiddenIds, q, store, dept, person, age, attention, sort, now]);
};
