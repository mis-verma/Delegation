import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { checklistInstanceApi, type FormerPersonName } from '../../../api/checklistInstances';
import { handleQueryRetry } from '../../../lib/queryHelpers';

const fetchNames = async (): Promise<FormerPersonName[]> => {
  try {
    return await checklistInstanceApi.getFormerPeopleNames();
  } catch {
    const full = await checklistInstanceApi.getFormerPeople();
    return full.map(p => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, email: '' }));
  }
};

export const useFormerPeopleNamesQuery = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-instances', 'former-people', 'names'] as const,
    queryFn: fetchNames,
    enabled: !!token,
    retry: handleQueryRetry,
    staleTime: 5 * 60_000,
  });
};
