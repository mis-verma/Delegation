import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import type { Role } from '../../api/auth';
import { approvalCoverApi, type NewApprovalCover } from '../../api/approvalCover';
import { useEntityMutation, handleQueryRetry } from '../../lib/queryHelpers';

const COVER_KEY = ['approval-cover'] as const;
const PEOPLE_KEY = ['approval-cover', 'people'] as const;
const REFRESH_KEYS = [COVER_KEY, ['checklist-instances'], ['tickets'], ['tasks'], ['dashboard']] as const;

export const useApprovalCoverQuery = () =>
  useQuery({ queryKey: COVER_KEY, queryFn: approvalCoverApi.list, staleTime: 30_000, retry: handleQueryRetry });

const COVER_ROLES: readonly Role[] = ['ADMIN', 'PC', 'MANAGER', 'SENIOR'];

export type ApproverProfile = { id: string; role: Role; departmentId: string | null };

export const useApprovers = (): ApproverProfile[] => {
  const { user } = useAuth();
  const eligible = !!user && COVER_ROLES.includes(user.role);
  const cover = useQuery({ queryKey: COVER_KEY, queryFn: approvalCoverApi.list, staleTime: 60_000, retry: handleQueryRetry, enabled: eligible });
  const received = cover.data?.received;
  return useMemo(() => {
    if (!user) return [];
    const own: ApproverProfile = { id: user.id, role: user.role, departmentId: user.departmentId ?? null };
    const borrowed = (received ?? [])
      .filter((row) => row.active)
      .map((row): ApproverProfile => ({ id: user.id, role: row.fromRole === 'ADMIN' ? 'PC' : row.fromRole, departmentId: row.fromDepartmentId }));
    return [own, ...borrowed];
  }, [user, received]);
};

export const useCoverPeopleQuery = () =>
  useQuery({ queryKey: PEOPLE_KEY, queryFn: approvalCoverApi.people, staleTime: 5 * 60_000, retry: handleQueryRetry });

export const useStartApprovalCoverMutation = () =>
  useEntityMutation({
    mutationFn: (payload: NewApprovalCover) => approvalCoverApi.create(payload),
    invalidateKeys: REFRESH_KEYS,
    successMessage: 'Cover started',
    errorFallback: "Couldn't start the cover. Try again.",
  });

export const useStopApprovalCoverMutation = () =>
  useEntityMutation({
    mutationFn: (id: string) => approvalCoverApi.remove(id),
    invalidateKeys: REFRESH_KEYS,
    successMessage: 'Cover stopped',
    errorFallback: "Couldn't stop the cover. Try again.",
    retryable: true,
  });
