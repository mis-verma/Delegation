import { apiFetch } from './http';

export type Department = {
  id: string;
  name: string;
  isActive: boolean;
  storeId: string | null;
  /** Works without a Manager or Senior: left out of the "no head" warning. */
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
  // No page/limit -> the full list (used everywhere departments feed a picker or the org tree).
  // Use getPage for the admin directory's paginated list view.
  getAll: () => apiFetch<ApiResponse<Department[]>>('/departments'),

  getPage: (page = 1, limit = 20) =>
    apiFetch<PaginatedResponse<Department>>(`/departments?page=${page}&limit=${limit}`),

  // POST /departments -- server rejects this with 403 unless you're ADMIN (see lookModule.ts's)
  //  `router.use(authenticate , requireRole("ADMIN"))` line, which run before the POST/PATCH/DELETE routes).
  create: (payload: CreateDepartmentPayload) =>
    apiFetch<ApiResponse<Department>>('/departments', { method: "POST", body: JSON.stringify(payload) }),

  //PATCH /departmetns/:id -- partials update, same ADMIN-only rule applies.
  update: (id: string, payload: UpdateDepartmentPayload) =>
    apiFetch<ApiResponse<Department>>(`/departments/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

   delete: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/departments/${id}` , {method : "DELETE"})

};

