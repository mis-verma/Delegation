import { apiFetch } from './http';
import type { Role } from './admin';

export type CustomRole = {
  id: string;
  name: string;
  baseRole: Role;
  description: string | null;
  isActive: boolean;
  peopleCount: number;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type CreateCustomRolePayload = {
  name: string;
  baseRole: Role;
  description?: string;
  isActive?: boolean;
};

export type UpdateCustomRolePayload = Partial<CreateCustomRolePayload>;

export const customRoleApi = {
  getAll: () => apiFetch<ApiResponse<CustomRole[]>>('/custom-roles'),

  create: (payload: CreateCustomRolePayload) =>
    apiFetch<ApiResponse<CustomRole>>('/custom-roles', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: UpdateCustomRolePayload) =>
    apiFetch<ApiResponse<CustomRole>>(`/custom-roles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  delete: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/custom-roles/${id}`, { method: 'DELETE' }),
};
