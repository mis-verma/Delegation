import { apiFetch } from './http';

export type Department = {
  id: string;
  name: string;
  isActive: boolean;
  storeId: string | null;
  headOptional?: boolean;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type PaginatedResponse<T> = {
  success: boolean;
  data:    T[];
  meta:    { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
};

export type CreateDepartmentPayload = {
  name: string;
  storeId?: string;
  headOptional?: boolean;
}

export type UpdateDepartmentPayload = Partial<Omit<CreateDepartmentPayload, "storeId">> & {
  isActive?: boolean;
  storeId?: string | null;
  headOptional?: boolean;
};

export const departmentApi = {
  getAll: () => apiFetch<ApiResponse<Department[]>>('/departments'),

  getPage: (page = 1, limit = 20) =>
    apiFetch<PaginatedResponse<Department>>(`/departments?page=${page}&limit=${limit}`),

  create: (payload: CreateDepartmentPayload) =>
    apiFetch<ApiResponse<Department>>('/departments', { method: "POST", body: JSON.stringify(payload) }),

  update: (id: string, payload: UpdateDepartmentPayload) =>
    apiFetch<ApiResponse<Department>>(`/departments/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

   delete: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/departments/${id}` , {method : "DELETE"})

};

