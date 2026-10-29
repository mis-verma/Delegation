import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { leaveApi, type NewLeave } from '../../api/leave';
import { handleQueryRetry, invalidateScoreCaches } from '../../lib/queryHelpers';

const KEY = ['leave'] as const;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export const useLeaveQuery = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEY,
    queryFn: () => leaveApi.list(),
    enabled: !!token,
    retry: handleQueryRetry,
  });
};

export const useLeavePreviewQuery = (params: { userId: string; startDate: string; endDate: string } | null) =>
  useQuery({
    queryKey: [...KEY, 'preview', params?.userId, params?.startDate, params?.endDate],
    queryFn: () => leaveApi.preview(params!),
    enabled: !!params,
    retry: false,
  });

const useRefreshAfterChange = () => {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
    queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
    queryClient.invalidateQueries({ queryKey: ['team'] });
    queryClient.invalidateQueries({ queryKey: ['exceptions'] });
    invalidateScoreCaches(queryClient);
  }, [queryClient]);
};

export const useCreateLeaveMutation = () => {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (payload: NewLeave) => leaveApi.create(payload),
    onSuccess: (res) => {
      refresh();
      toast.success(res.removedRuns > 0 ? `Leave saved. ${res.removedRuns} checklist${res.removedRuns === 1 ? '' : 's'} nobody had started ${res.removedRuns === 1 ? 'was' : 'were'} removed.` : 'Leave saved.');
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't save the leave. Try again.")),
  });
};

export const useRemoveLeaveMutation = () => {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => leaveApi.remove(id),
    onSuccess: () => {
      refresh();
      toast.success('Leave removed. Their checklists come back.');
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't remove the leave. Try again.")),
  });
};
