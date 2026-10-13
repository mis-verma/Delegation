import { apiFetch } from './http';
import { authApi } from './auth';
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
  /** Runs that came due: completed, or past their cutoff. Open runs are in neither side. */
  due?: number;
  /** Not completed and still before the cutoff: in no percentage. */
  open?: number;
  /** completed / due. No partial credit for a run that is only partly filled. */
  completionPct: number | null;
  onTime: number;
  /** On time of finished: onTime / completed (same as onTimeOfFinishedPct). */
  onTimePct: number | null;
  onTimeOfFinishedPct?: number | null;
  /** Met deadline: onTime / due. Late and missed runs both count against it. */
  metDeadlinePct?: number | null;
  missed: number;
  submitted: number;
  approved: number;
  sentBack: number;
  questionsDone: number;
  notApplicable: number;
  answersChecked: number;
  /** null when no answer in the period had an accepted-answer rule to check. */
  compliancePct: number | null;
  /** Raw weights behind compliancePct (critical x2), so rows can be pooled without averaging percentages. */
  weightedGood?: number;
  weightedScored?: number;
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

// http.ts keeps its own refresh private, so this mirrors it: the same cross-tab lock (the refresh
// token is single-use, so two tabs must not race), reusing a token another tab already rotated,
// then authApi.refresh. Null means the session is really gone.
const refreshAccessToken = (staleToken: string | null): Promise<string | null> => {
  const run = async () => {
    const latest = tokenStore.get();
    if (latest && latest !== staleToken) return latest;
    try {
      const { accessToken } = await authApi.refresh();
      tokenStore.set(accessToken);
      return accessToken;
    } catch {
      return null;
    }
  };
  return 'locks' in navigator ? navigator.locks.request('tm-auth-refresh', run) : run();
};

const parseFilename =(contentDisposition: string | null, fallback: string) =>
  contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? fallback;

export const checklistReportApi = {
  preview: (params: ChecklistReportParams) =>
    apiFetch<{ success: boolean; data: ChecklistReport }>(`/checklist-reports/people?${toQuery(params)}`).then((r) => r.data),

  // A file can't come back through apiFetch's JSON wrapper and a plain link can't carry the
  // Authorization header, so this fetches the blob directly (same approach as reportApi in
  // ./reports.ts) and hands it to the shared downloadBlob. An expired access token (they only live
  // 15 minutes) gets one refresh and one retry, the way apiFetch does it.
  async download(params: ChecklistReportParams, format: ChecklistReportFormat) {
    const url = `${BASE}/checklist-reports/export?${toQuery(params)}&format=${format}`;
    const send = async (token: string | null) => {
      try {
        return await fetch(url, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      } catch {
        throw new Error('Network error. Check your connection and try again.');
      }
    };

    const token = tokenStore.get();
    let res = await send(token);
    if (res.status === 401 && token) {
      const fresh = await refreshAccessToken(token);
      if (!fresh) throw new Error('Your session has expired. Sign in again, then download the report.');
      res = await send(fresh);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message ?? 'Could not download the report');
    }
    const blob = await res.blob();
    downloadBlob(blob, parseFilename(res.headers.get('Content-Disposition'), `checklist-report-${params.from}_to_${params.to}.${format}`));
  },
};
