import { useCallback } from 'react';
import { ownerMayVisit } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';

export const useIsReadOnlyViewer = (): boolean => {
  const { user } = useAuth();
  return user?.role === 'OWNER';
};

const pathOf = (href: string) => href.split(/[?#]/)[0] || '/';

export const useCanOpen = (): ((href: string) => boolean) => {
  const readOnly = useIsReadOnlyViewer();
  return useCallback((href: string) => !readOnly || ownerMayVisit(pathOf(href)), [readOnly]);
};
