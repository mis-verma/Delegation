import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import {
  dressTypeApi,
  type CreateDressTypePayload,
  type DressType,
  type UpdateDressTypePayload,
} from '../../../api/dressTypes';
import { ApiError } from '../../../api/http';
import { handleQueryRetry, errorMessage } from '../../../lib/queryHelpers';

const KEY = ['dress-types'] as const;

export const useDressTypesQuery = () => {
  const { token, user } = useAuth();
  const allowed = user?.role === 'ADMIN' || user?.role === 'PC';
  return useQuery({
    queryKey: KEY,
    queryFn: () => dressTypeApi.getAll().then(r => r.data),
    enabled: !!token && allowed,
    retry: handleQueryRetry,
    staleTime: 60_000,
  });
};

const useRefreshAfterChange = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: KEY });
  };
};

export const useCreateDressTypeMutation = () => {
  const refresh = useRefreshAfterChange();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDressTypePayload) => dressTypeApi.create(payload).then(r => r.data),
    onSuccess: (created) => {
      queryClient.setQueryData<DressType[]>(KEY, (old) => (old ? [...old, created] : [created]));
      refresh();
      toast.success('Dress type added');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to add this dress type')),
  });
};

export const useUpdateDressTypeMutation = () => {
  const refresh = useRefreshAfterChange();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateDressTypePayload }) =>
      dressTypeApi.update(id, payload).then(r => r.data),
    onSuccess: (updated, { payload }) => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
      const onlyToggled = payload.isActive !== undefined && payload.name === undefined && payload.gender === undefined;
      toast.success(onlyToggled ? `${updated.name} turned ${payload.isActive ? 'on' : 'off'}` : 'Dress type updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to update this dress type')),
  });
};

export const useDeleteDressTypeMutation = () => {
  const refresh = useRefreshAfterChange();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dressTypeApi.delete(id),
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
      toast.success('Dress type deleted');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) refresh();
      toast.error(errorMessage(err, 'Failed to delete this dress type'));
    },
  });
};
