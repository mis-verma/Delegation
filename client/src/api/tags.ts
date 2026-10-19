import { apiFetch } from './http';

export type Tag = {
  id: string;
  name: string;
  color: string | null;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type CreateTagPayload = { name: string; color?: string | null };
export type UpdateTagPayload = Partial<CreateTagPayload>;

export const tagApi = {
  getAll: () => apiFetch<ApiResponse<Tag[]>>('/tags'),

  create: (payload: CreateTagPayload) =>
    apiFetch<ApiResponse<Tag>>('/tags', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: UpdateTagPayload) =>
    apiFetch<ApiResponse<Tag>>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  delete: (id: string) =>
    apiFetch<ApiResponse<{ delete: boolean }>>(`/tags/${id}`, { method: 'DELETE' }),
};
