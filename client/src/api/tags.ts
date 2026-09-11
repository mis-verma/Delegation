import { apiFetch } from './http';

export type Tag = {
  id: string;
  name: string;
  /** Optional in the schema; nothing sets it yet, so the UI derives a colour from the name. */
  color: string | null;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type CreateTagPayload = { name: string; color?: string };
export type UpdateTagPayload = Partial<CreateTagPayload>;

// Labels — shared by Delegation and Tickets, not owned by either. Backed by the shared lookup
// router (see server/modules/tags/tag.routes.ts): reads are open to any signed-in user because
// both modules' filter rows and forms need them, writes are ADMIN/PC only and will 403 otherwise.
export const tagApi = {
  getAll: () => apiFetch<ApiResponse<Tag[]>>('/tags'),

  create: (payload: CreateTagPayload) =>
    apiFetch<ApiResponse<Tag>>('/tags', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: UpdateTagPayload) =>
    apiFetch<ApiResponse<Tag>>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  delete: (id: string) =>
    apiFetch<ApiResponse<{ delete: boolean }>>(`/tags/${id}`, { method: 'DELETE' }),
};
