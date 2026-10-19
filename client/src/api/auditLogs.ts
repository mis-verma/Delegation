import { apiFetch } from './http';
import type { ApiResponse } from './checklistDefinitions';
import type { Role } from './auth';

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
  actorName: string | null;
  source: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  actor: { id: string; email: string; firstName: string; lastName: string | null; role: Role } | null;
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
  group?: AuditGroup;
  source?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

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
