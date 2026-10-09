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

/**
 * Every dress type (active and inactive). The catalog is ADMIN/PC only on the server, so the query
 * stays off for anyone else: its callers (the Users form, the checklist builder) are admin pages.
 */
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

// A type's people count and name also show on the roster and on audit cards.
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
      // Seed the cache first so a caller that selects the new type straight away can read its name
      // before the refetch lands.
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
      // A rename or a gender change shows on audit cards and in the checklist builder too.
      queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
      // A switch flip names the type and the new state; any other edit is just "updated".
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
      // 409 = someone still holds the type. The server's own sentence says who and what to do, so show
      // it as is, and reload the list because the counts on screen are evidently out of date.
      if (err instanceof ApiError && err.status === 409) refresh();
      toast.error(errorMessage(err, 'Failed to delete this dress type'));
    },
  });
};
