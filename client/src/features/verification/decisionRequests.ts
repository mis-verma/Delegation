import { apiFetch } from '../../api/http';

type RunOptions = { keepalive: boolean };

const patch = (path: string, body: unknown, { keepalive }: RunOptions) =>
  apiFetch<unknown>(path, { method: 'PATCH', body: JSON.stringify(body), keepalive });

export const approveRun = (id: string) => (options: RunOptions) =>
  patch(`/checklist-instances/${id}/verify`, { action: 'APPROVE' }, options);

export const rejectRun = (id: string, note: string, fixByHours?: number | null) => (options: RunOptions) =>
  patch(`/checklist-instances/${id}/verify`, { action: 'REJECT', note, ...(fixByHours ? { fixByHours } : {}) }, options);

export const approveTicketRun = (id: string, note?: string) => (options: RunOptions) =>
  patch(`/tickets/${id}/verify`, { action: 'APPROVE', ...(note ? { note } : {}) }, options);

export const rejectTicketRun = (id: string, note: string) => (options: RunOptions) =>
  patch(`/tickets/${id}/verify`, { action: 'REJECT', note }, options);

export const approveTaskRun = (id: string, note?: string) => (options: RunOptions) =>
  patch(`/tasks/${id}/verify`, { action: 'APPROVE', ...(note ? { note } : {}) }, options);

export const rejectTaskRun = (id: string, note: string) => (options: RunOptions) =>
  patch(`/tasks/${id}/verify`, { action: 'REJECT', note }, options);

export const sendBackRun = (id: string, itemIds: string[], note: string, fixByHours?: number | null) => (options: RunOptions) =>
  patch(`/checklist-instances/${id}/send-back`, { itemIds, note, ...(fixByHours ? { fixByHours } : {}) }, options);
