import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import {
  dressTypeApi,
  type CreateDressTypePayload,
  type DressType,
  type UpdateDressTypePayload,
} from '../../../api/dressTypes';
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
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Dress type updated');
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
    onError: (err) => toast.error(errorMessage(err, 'Failed to delete this dress type')),
  });
};
