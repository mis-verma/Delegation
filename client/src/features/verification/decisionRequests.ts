import { apiFetch } from '../../api/http';

// The three review calls, sent straight through apiFetch so they can carry `keepalive`: that lets a
// decision still go out while the tab is closing. Same endpoints and bodies as
// checklistInstanceApi.verify / sendBack, which the detail page keeps using.

type RunOptions = { keepalive: boolean };

const patch = (path: string, body: unknown, { keepalive }: RunOptions) =>
  apiFetch<unknown>(path, { method: 'PATCH', body: JSON.stringify(body), keepalive });

export const approveRun = (id: string) => (options: RunOptions) =>
  patch(`/checklist-instances/${id}/verify`, { action: 'APPROVE' }, options);

/** Sends the whole run back for changes (every question resets). */
export const rejectRun = (id: string, note: string) => (options: RunOptions) =>
  patch(`/checklist-instances/${id}/verify`, { action: 'REJECT', note }, options);

// Tickets and delegations take the same two decisions on their own endpoints. A note is optional on
// approve and required on send back (the server refuses an empty one).
export const approveTicketRun = (id: string, note?: string) => (options: RunOptions) =>
  patch(`/tickets/${id}/verify`, { action: 'APPROVE', ...(note ? { note } : {}) }, options);

export const rejectTicketRun = (id: string, note: string) => (options: RunOptions) =>
  patch(`/tickets/${id}/verify`, { action: 'REJECT', note }, options);

export const approveTaskRun = (id: string, note?: string) => (options: RunOptions) =>
  patch(`/tasks/${id}/verify`, { action: 'APPROVE', ...(note ? { note } : {}) }, options);

export const rejectTaskRun = (id: string, note: string) => (options: RunOptions) =>
  patch(`/tasks/${id}/verify`, { action: 'REJECT', note }, options);

/** Sends only the named questions back; the rest stay done. */
export const sendBackRun = (id: string, itemIds: string[], note: string) => (options: RunOptions) =>
  patch(`/checklist-instances/${id}/send-back`, { itemIds, note }, options);
