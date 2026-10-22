import { apiFetch } from './http';
import type { Role } from './auth';

export interface ViewAsTarget {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  role: Role;
  departmentId: string | null;
  storeId: string | null;
}

export const viewAsApi = {
  start: (userId: string) =>
    apiFetch<{ success: boolean; data: ViewAsTarget }>('/view-as/start', { method: 'POST', body: JSON.stringify({ userId }) }).then((r) => r.data),
  end: (userId: string) =>
    apiFetch<{ success: boolean }>('/view-as/end', { method: 'POST', body: JSON.stringify({ userId }) }),
};
