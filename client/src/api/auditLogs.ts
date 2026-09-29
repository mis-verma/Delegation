import { apiFetch } from './http';
import type { ApiResponse } from './checklistDefinitions';
import type { Role } from './auth';

// Exactly the entityType/action strings every module's auditService.record() call actually
// passes today (server/src/modules/**/*.service.ts) — free-form strings on the wire, not a real
// enum, so this list is a snapshot to build filter dropdowns from, not a hard contract.
export const AUDIT_ENTITY_TYPES = [
  'Ticket', 'Task', 'ChecklistDefinition', 'ChecklistTemplate', 'ChecklistInstance',
  'User', 'Category', 'Department', 'Event', 'Project', 'Settings',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'VERIFY', 'APPROVE', 'REJECT', 'ACTIVATE', 'DEACTIVATE', 'PASSWORD_RESET',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditLog = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  actor: { id: string; email: string; firstName: string; lastName: string | null; role: Role } | null;
};

export type AuditLogPage = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
};

export type AuditLogFilter = {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

// Same shape as checklistInstances.ts's own buildQuery — kept local since neither file imports
// the other and there's no third caller yet to justify a shared util for four lines.
const buildQuery = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const auditLogApi = {
  list: (filter: AuditLogFilter = {}) =>
    apiFetch<ApiResponse<AuditLog[]> & { meta: AuditLogPage }>(`/audit-logs${buildQuery(filter)}`),
};
