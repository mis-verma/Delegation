import { useAuth } from '../../../context/AuthContext';

export const useCanReopen = (): boolean => useAuth().user?.role === 'ADMIN';
