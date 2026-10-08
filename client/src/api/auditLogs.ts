import { apiFetch } from './http';
import type { ApiResponse } from './checklistDefinitions';
import type { Role } from './auth';

// Exactly the entityType/action strings every module's auditService.record() call actually
// passes today (server/src/modules/**/*.service.ts) — free-form strings on the wire, not a real
// enum, so this list is a snapshot to build filter dropdowns from, not a hard contract.
export const AUDIT_ENTITY_TYPES = [
  'Ticket', 'Task', 'ChecklistDefinition', 'ChecklistTemplate', 'ChecklistInstance',
  'ChecklistInstanceItem', 'ChecklistInstanceImage', 'ChecklistInstanceItemSubmissionImage',
  'User', 'Category', 'Department', 'Store', 'Holiday', 'DressType', 'Event', 'Project', 'Settings',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'VERIFY', 'APPROVE', 'REJECT', 'ACTIVATE', 'DEACTIVATE', 'PASSWORD_RESET',
  'SUBMIT', 'SEND_BACK', 'REOPEN_APPROVAL', 'REOPEN', 'COMPLETE', 'REASSIGN', 'OFFBOARD', 'WAIVE', 'UNWAIVE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// Where a change came from: 'APP' is a signed-in person, 'WHATSAPP' the bot, 'SYSTEM' a scheduled
// job. The server filter takes the same free-form string.
export const AUDIT_SOURCES = ['APP', 'WHATSAPP', 'SYSTEM'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export const AUDIT_GROUPS = ['checklists', 'tickets', 'tasks', 'people', 'settings'] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number];

export type AuditLog = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  /** The person's name as it was when they made the change; stays right after a rename or removal. */
  actorName: string | null;
  /** 'APP', 'SYSTEM' or 'WHATSAPP'; null on older entries. */
  source: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  actor: { id: string; email: string; firstName: string; lastName: string | null; role: Role } | null;
  /** What the record is called now (ticket/delegation title, checklist name); null when it no longer exists or has no name. */
  entityTitle?: string | null;
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
  /** One tab of the Audit Log page: a family of sections. */
  group?: AuditGroup;
  source?: string;
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
