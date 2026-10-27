import { tokenStore } from '../lib/tokenStore';
import { apiFetch } from './http';

export type ApprovalTatCounts = { met: number; breached: number; pending: number };
export type ApprovalWaiting = { now: number; over24h: number };
export type ApprovalKind = 'checklist' | 'ticket' | 'delegation';

export type ApprovalTat = ApprovalTatCounts & {
  windowHours: number;
  rate: number | null;
  byKind: Record<ApprovalKind, ApprovalTatCounts>;
  decided: number;
  avgDecisionHours: number | null;
  avgDecisionHoursByKind: Record<ApprovalKind, number | null>;
  waiting: Record<ApprovalKind | 'total', ApprovalWaiting>;
};

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

export type ReportModule = 'tickets' | 'tasks' | 'checklists';
export type DepartmentReportModule = Exclude<ReportModule, 'checklists'>;
export type ReportFormat = 'csv' | 'xlsx' | 'pdf';
export type DepartmentReportContent = 'summary' | 'periods' | 'details';
export type DepartmentReportGranularity = 'auto' | 'week' | 'month' | 'year';

export type ReportExportParams = {
  from?: string;
  to?: string;
  format: ReportFormat;
  category?: 'issue' | 'delegation' | 'task';
  status?: string;
  priority?: string[];
  departmentId?: string;
  assigneeIds?: string[];
  storeId?: string;
};

const parseFilename = (contentDisposition: string | null, fallback: string) => {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
};

export type DepartmentReportParams = ReportExportParams & {
  content: DepartmentReportContent;
  granularity: DepartmentReportGranularity;
};

const exportQuery = (params: ReportExportParams) => {
  const query = new URLSearchParams({ format: params.format });
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.category) query.set('category', params.category);
  if (params.status) query.set('status', params.status);
  if (params.priority?.length) query.set('priority', params.priority.join(','));
  if (params.departmentId) query.set('departmentId', params.departmentId);
  if (params.assigneeIds?.length) query.set('assigneeIds', params.assigneeIds.join(','));
  if (params.storeId) query.set('storeId', params.storeId);
  return query;
};

const downloadReport = async (path: string, query: URLSearchParams, fallbackName: string) => {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}${path}?${query.toString()}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? 'Export failed');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = parseFilename(res.headers.get('Content-Disposition'), fallbackName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export type OverdueSnapshot = { day: string; tickets: number | null; delegations: number | null };

export const reportApi = {
  overdueSnapshot: (day: string) =>
    apiFetch<{ success: boolean; data: OverdueSnapshot }>(`/reports/overdue-snapshot?${new URLSearchParams({ day }).toString()}`).then((r) => r.data),

  approvalTat: (from: string, to: string) =>
    apiFetch<{ success: boolean; data: ApprovalTat }>(`/reports/approval-tat?${new URLSearchParams({ from, to }).toString()}`).then((r) => r.data),

  downloadExport: (reportModule: ReportModule, params: ReportExportParams) =>
    downloadReport(`/reports/${reportModule}/export`, exportQuery(params), `${reportModule}-export.${params.format}`),

  downloadDepartmentReport: (reportModule: DepartmentReportModule, params: DepartmentReportParams) => {
    const query = exportQuery(params);
    query.set('module', reportModule);
    query.set('content', params.content);
    query.set('granularity', params.granularity);
    return downloadReport('/reports/department/export', query, `${reportModule}-by-department.${params.format}`);
  },
};
