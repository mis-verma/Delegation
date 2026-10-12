import { tokenStore } from '../lib/tokenStore';
import { apiFetch } from './http';

export type ApprovalTatCounts = { met: number; breached: number; pending: number };
/** Waiting for a decision right now (not tied to the period), and how many of those past 24 hours. */
export type ApprovalWaiting = { now: number; over24h: number };
export type ApprovalKind = 'checklist' | 'ticket' | 'delegation';

/** GET /reports/approval-tat (Admin and PC): hand-ins in the period judged against the 24 hour promise. */
export type ApprovalTat = ApprovalTatCounts & {
  windowHours: number;
  /** met / (met + breached), whole percent; null when nothing has come due. */
  rate: number | null;
  byKind: Record<ApprovalKind, ApprovalTatCounts>;
  /** Hand-ins in the period that got a decision, and the average hours from hand-in to decision. */
  decided: number;
  avgDecisionHours: number | null;
  avgDecisionHoursByKind: Record<ApprovalKind, number | null>;
  waiting: Record<ApprovalKind | 'total', ApprovalWaiting>;
};

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

export type ReportModule = 'tickets' | 'tasks' | 'checklists';
export type ReportFormat = 'csv' | 'xlsx';

// category/status/priority/departmentId/assigneeIds only apply to the "tasks" module — they
// mirror TaskList's own filter bar so "Export" downloads what's on screen, not the whole table.
export type ReportExportParams = {
  from?: string;
  to?: string;
  format: ReportFormat;
  category?: 'issue' | 'delegation' | 'task';
  status?: string;
  priority?: string[];
  departmentId?: string;
  assigneeIds?: string[];
  /** Checklists-only: scope the export to one store. */
  storeId?: string;
};

const parseFilename = (contentDisposition: string | null, fallback: string) => {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
};

export const reportApi = {
  /** `from` and `to` are ISO instants: the hand-in window. */
  approvalTat: (from: string, to: string) =>
    apiFetch<{ success: boolean; data: ApprovalTat }>(`/reports/approval-tat?${new URLSearchParams({ from, to }).toString()}`).then((r) => r.data),

  // File downloads can't go through apiFetch's JSON-only wrapper, and a plain <a href> can't
  // carry the Authorization header — so this fetches the file as a blob directly, then triggers
  // the browser's native download via a throwaway object URL + anchor click.
  async downloadExport(reportModule: ReportModule, params: ReportExportParams) {
    const token = tokenStore.get();
    const query = new URLSearchParams({ format: params.format });
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.category) query.set('category', params.category);
    if (params.status) query.set('status', params.status);
    if (params.priority?.length) query.set('priority', params.priority.join(','));
    if (params.departmentId) query.set('departmentId', params.departmentId);
    if (params.assigneeIds?.length) query.set('assigneeIds', params.assigneeIds.join(','));
    if (params.storeId) query.set('storeId', params.storeId);

    const res = await fetch(`${BASE}/reports/${reportModule}/export?${query.toString()}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message ?? 'Export failed');
    }

    const blob = await res.blob();
    const filename = parseFilename(res.headers.get('Content-Disposition'), `${reportModule}-export.${params.format}`);

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
