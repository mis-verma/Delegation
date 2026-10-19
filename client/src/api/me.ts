import { apiFetch } from './http';
import type { Role } from './auth';
import type { ApiResponse } from './admin';

export type MyProfile = {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: Role;
  departmentId: string | null;
  storeId: string | null;
  phone: string | null;
  avatarUrl: string | null;
  weekOffDays: number[] | null;
  createdAt: string;
};

export type UpdateMyProfilePayload = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  weekOffDays?: number[];
};

export type ChangeMyPasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export const meApi = {
  get: () => apiFetch<ApiResponse<MyProfile>>('/users/me'),

  update: (payload: UpdateMyProfilePayload) =>
    apiFetch<ApiResponse<MyProfile>>('/users/me', { method: 'PATCH', body: JSON.stringify(payload) }),

  changePassword: (payload: ChangeMyPasswordPayload) =>
    apiFetch<ApiResponse<{ changed: boolean }>>('/users/me/password', { method: 'POST', body: JSON.stringify(payload) }),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return apiFetch<ApiResponse<MyProfile>>('/users/me/avatar', { method: 'POST', body: formData });
  },

  removeAvatar: () => apiFetch<ApiResponse<MyProfile>>('/users/me/avatar', { method: 'DELETE' }),
};
