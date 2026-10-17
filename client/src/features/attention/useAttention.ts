import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { peopleApi } from '../../api/exceptions';
import { handleQueryRetry, useEntityMutation } from '../../lib/queryHelpers';

const OVERSIGHT = new Set(['ADMIN', 'PC', 'MANAGER', 'SENIOR']);
const LIVE_MS = 60_000;

export const ATTENTION_KEYS = {
  people: ['exceptions', 'people'] as const,
  person: (id: string) => ['exceptions', 'person', id] as const,
  heatmap: (from: string, to: string, departmentId: string, storeId: string) => ['exceptions', 'heatmap', from, to, departmentId, storeId] as const,
  approvals: (from: string, to: string) => ['exceptions', 'approvals', from, to] as const,
};

export const useCanOversee = () => {
  const { user, token } = useAuth();
  return !!token && !!user && OVERSIGHT.has(user.role);
};

export const useAttentionPeople = () => {
  const enabled = useCanOversee();
  return useQuery({
    queryKey: ATTENTION_KEYS.people,
    queryFn: peopleApi.list,
    enabled,
    retry: handleQueryRetry,
    staleTime: 30_000,
    refetchInterval: LIVE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
};

export const usePersonAttention = (userId: string | null) => {
  const enabled = useCanOversee() && !!userId;
  return useQuery({
    queryKey: ATTENTION_KEYS.person(userId ?? ''),
    queryFn: () => peopleApi.person(userId!),
    enabled,
    retry: handleQueryRetry,
    staleTime: 15_000,
    refetchInterval: LIVE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
};

export const useFillHeatmap = (from: string, to: string, departmentId = '', storeId = '') => {
  const enabled = useCanOversee();
  return useQuery({
    queryKey: ATTENTION_KEYS.heatmap(from, to, departmentId, storeId),
    queryFn: () => peopleApi.heatmap(from, to, { departmentId: departmentId || undefined, storeId: storeId || undefined }),
    enabled,
    retry: handleQueryRetry,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
};

export const useTeamApprovals = (fromIso: string, toIso: string) => {
  const enabled = useCanOversee();
  return useQuery({
    queryKey: ATTENTION_KEYS.approvals(fromIso, toIso),
    queryFn: () => peopleApi.approvals(fromIso, toIso),
    enabled,
    retry: handleQueryRetry,
    staleTime: 60_000,
  });
};

export const useRemindMutation = () =>
  useEntityMutation({
    mutationFn: (userIds: string[]) => peopleApi.remind(userIds),
    invalidateKeys: [['exceptions']],
    successMessage: (r) =>
      r.sent === 0
        ? r.skipped > 0 ? 'Already reminded in the last 30 minutes' : 'Nobody to remind'
        : `Reminder sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}${r.skipped ? `, ${r.skipped} reminded recently` : ''}`,
    errorFallback: "Couldn't send the reminder. Try again.",
    retryable: true,
  });

export const useNow = (everyMs = 30_000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return now;
};
