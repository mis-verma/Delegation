import { apiFetch } from './http';

export type Tag = {
  id: string;
  name: string;
  color: string | null;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type CreateTagPayload = { name: string; color?: string | null };
export type UpdateTagPayload = Partial<CreateTagPayload>;

export type TagUsage = Tag & { tickets : number; tasks : number };

export type TagDuplicateGroup = { key : string; keep : TagUsage; merge : TagUsage[] };

export type TagCleanup = { tags : TagUsage[]; duplicates : TagDuplicateGroup[]; unused : TagUsage[] };

export const tagApi = {
  cleanup: () => apiFetch<ApiResponse<TagCleanup>>('/tags/cleanup').then((r) => r.data),

  bulkDelete: (ids: string[]) =>
    apiFetch<ApiResponse<{ deleted: number; kept: string[]; keptIds: string[] }>>('/tags/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }).then((r) => r.data),

  merge: (fromIds: string[], intoId: string) =>
    apiFetch<ApiResponse<{ merged: number; movedTickets: number; movedTasks: number }>>('/tags/merge', { method: 'POST', body: JSON.stringify({ fromIds, intoId }) }).then((r) => r.data),

  getAll: () => apiFetch<ApiResponse<Tag[]>>('/tags'),

  create: (payload: CreateTagPayload) =>
    apiFetch<ApiResponse<Tag>>('/tags', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, payload: UpdateTagPayload) =>
    apiFetch<ApiResponse<Tag>>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  delete: (id: string) =>
    apiFetch<ApiResponse<{ delete: boolean }>>(`/tags/${id}`, { method: 'DELETE' }),
};
