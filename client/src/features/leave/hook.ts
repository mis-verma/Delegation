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

export const useLeaveRulesQuery = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'rules'],
    queryFn: () => leaveApi.rules(),
    enabled: !!token,
    staleTime: 60 * 60 * 1000,
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
      if (res.status === 'PENDING') {
        toast.success('Request sent. Your manager will approve or decline it.');
        return;
      }
      toast.success(res.removedRuns > 0 ? `Leave saved. ${removedText(res.removedRuns)}` : 'Leave saved.');
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't save the leave. Try again.")),
  });
};

const removedText = (n: number) => `${n} checklist${n === 1 ? '' : 's'} nobody had started ${n === 1 ? 'was' : 'were'} removed.`;

export const useDecideLeaveMutation = () => {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) => (approve ? leaveApi.approve(id) : leaveApi.decline(id, note)),
    onSuccess: (res) => {
      refresh();
      if (res.status === 'DECLINED') toast.success('Request declined. They have been told.');
      else toast.success(res.removedRuns > 0 ? `Leave approved. ${removedText(res.removedRuns)}` : 'Leave approved.');
    },
    onError: (err) => {
      refresh();
      toast.error(errorMessage(err, "Couldn't save your decision. Try again."));
    },
  });
};

export const useRemoveLeaveMutation = () => {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id }: { id: string; message: string }) => leaveApi.remove(id),
    onSuccess: (_res, { message }) => {
      refresh();
      toast.success(message);
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't remove the leave. Try again.")),
  });
};
