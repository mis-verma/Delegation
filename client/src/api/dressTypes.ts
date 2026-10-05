import { apiFetch } from './http';

export type DressTypeGender = 'FEMALE' | 'MALE';

/** An admin-defined dress type (e.g. Saree, Coat and pant). gender null = for anyone. */
export type DressType = {
  id: string;
  name: string;
  gender: DressTypeGender | null;
  isActive: boolean;
  /** How many people currently have this type. */
  peopleCount: number;
};

export type CreateDressTypePayload = {
  name: string;
  gender?: DressTypeGender | null;
};

export type UpdateDressTypePayload = {
  name?: string;
  /** null = for anyone. */
  gender?: DressTypeGender | null;
  isActive?: boolean;
};

type ApiResponse<T> = { success: boolean; data: T };

export const dressTypeApi = {
  getAll: () => apiFetch<ApiResponse<DressType[]>>('/dress-types'),

  create: (payload: CreateDressTypePayload) =>
    apiFetch<ApiResponse<DressType>>('/dress-types', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: UpdateDressTypePayload) =>
    apiFetch<ApiResponse<DressType>>(`/dress-types/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  delete: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/dress-types/${id}`, { method: 'DELETE' }),
};
