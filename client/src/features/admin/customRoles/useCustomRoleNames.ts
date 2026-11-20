import { useMemo } from 'react';
import { useCustomRolesQuery } from '../hook';

export const useCustomRoleNames = (): ReadonlyMap<string, string> => {
  const { data: customRoles } = useCustomRolesQuery();
  return useMemo(() => new Map((customRoles ?? []).map((r) => [r.id, r.name])), [customRoles]);
};
