import { apiFetch } from './http';

export type ActivityEntity = 'Task' | 'Ticket';

export type ActivityKind = 'created' | 'status' | 'approved' | 'sent_back' | 'due_changed' | 'priority_changed' | 'reassigned' | 'edited';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  actor: { name: string; role: string | null } | null;
  from?: string | null;
  to?: string | null;
  remark?: string | null;
  fields?: string[];
}

export interface ActivitySummary {
  status: string;
  createdAt: string;
  createdBy: string | null;
  assignee: string | null;
  statusSince: string;
  dueAt: string | null;
}

export interface ActivityFeedData {
  entityType: ActivityEntity;
  summary: ActivitySummary;
  events: ActivityEvent[];
  truncated: boolean;
}

export const activityApi = {
  get: (entityType: ActivityEntity, entityId: string) =>
    apiFetch<{ success: boolean; data: ActivityFeedData }>(`/activity?${new URLSearchParams({ entityType, entityId }).toString()}`).then((r) => r.data),
};
