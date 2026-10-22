import { apiFetch } from './http';

export type Store = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  isActive: boolean;
  weekOffDays?: number[] | null;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type PaginatedResponse<T> = {
  success: boolean;
  data:    T[];
  meta:    { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
};

export type CreateStorePayload = {
  name: string;
  code?: string;
  address?: string;
  weekOffDays?: number[];
};

export type UpdateStorePayload = Partial<CreateStorePayload> & { isActive?: boolean };

export const storeApi = {
  getAll: () => apiFetch<ApiResponse<Store[]>>('/stores'),

  getPage: (page = 1, limit = 20) =>
    apiFetch<PaginatedResponse<Store>>(`/stores?page=${page}&limit=${limit}`),

  create: (payload: CreateStorePayload) =>
    apiFetch<ApiResponse<Store>>('/stores', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: UpdateStorePayload) =>
    apiFetch<ApiResponse<Store>>(`/stores/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  delete: (id: string) =>
    apiFetch<ApiResponse<{ delete: boolean }>>(`/stores/${id}`, { method: 'DELETE' }),
};
