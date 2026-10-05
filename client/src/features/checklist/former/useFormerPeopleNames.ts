import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { checklistInstanceApi, type FormerPersonName } from '../../../api/checklistInstances';
import { handleQueryRetry } from '../../../lib/queryHelpers';

// Names only: the light endpoint skips the per-person aggregates the Former People page needs. If
// it fails (an older server without the route), fall back to the full list so a "(left)" name still
// resolves instead of the page showing "Unknown".
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
