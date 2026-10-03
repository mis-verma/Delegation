import { apiFetch } from './http';
import { tokenStore } from '../lib/tokenStore';
import { downloadBlob } from '../lib/exportTable';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

export type ChecklistReportGrouping = 'person' | 'department' | 'both';
export type ChecklistReportFormat = 'xlsx' | 'csv';

/** `from` and `to` are calendar days, YYYY-MM-DD. */
export interface ChecklistReportParams {
  from: string;
  to: string;
  storeId?: string;
  /** Ignored by the server for a department head, who always gets their own department. */
  departmentId?: string;
  groupBy: ChecklistReportGrouping;
}

export interface ChecklistReportMetrics {
  assigned: number;
  completed: number;
  completionPct: number | null;
  onTime: number;
  onTimePct: number | null;
  missed: number;
  submitted: number;
  approved: number;
  sentBack: number;
  questionsDone: number;
  notApplicable: number;
  answersChecked: number;
  /** null when no answer in the period had an accepted-answer rule to check. */
  compliancePct: number | null;
}

export interface ChecklistReportPerson extends ChecklistReportMetrics {
  userId: string;
  name: string;
  role: string;
  department: string;
  store: string;
  status: 'Active' | 'Left';
}

export interface ChecklistReportDepartment extends ChecklistReportMetrics {
  departmentId: string | null;
  department: string;
  people: number;
}

export interface ChecklistReport {
  from: string;
  to: string;
  generatedAt: string;
  storeName: string | null;
  departmentName: string | null;
  departmentLocked: boolean;
  people: ChecklistReportPerson[];
  departments: ChecklistReportDepartment[];
  notes: string[];
}

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
};

const toQuery = (params: ChecklistReportParams) =>
  buildQuery({ from: params.from, to: params.to, storeId: params.storeId, departmentId: params.departmentId, groupBy: params.groupBy });

const parseFilename = (contentDisposition: string | null, fallback: string) =>
  contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? fallback;

export const checklistReportApi = {
  preview: (params: ChecklistReportParams) =>
    apiFetch<{ success: boolean; data: ChecklistReport }>(`/checklist-reports/people?${toQuery(params)}`).then((r) => r.data),

  // A file can't come back through apiFetch's JSON wrapper and a plain link can't carry the
  // Authorization header, so this fetches the blob directly (same approach as reportApi in
  // ./reports.ts) and hands it to the shared downloadBlob.
  async download(params: ChecklistReportParams, format: ChecklistReportFormat) {
    const token = tokenStore.get();
    const res = await fetch(`${BASE}/checklist-reports/export?${toQuery(params)}&format=${format}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message ?? 'Could not download the report');
    }
    const blob = await res.blob();
    downloadBlob(blob, parseFilename(res.headers.get('Content-Disposition'), `checklist-report-${params.from}_to_${params.to}.${format}`));
  },
};
