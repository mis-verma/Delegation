import { apiFetch } from './http';

export type ScoreScope = 'person' | 'department' | 'store';
export type TrendPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface ChecklistScore {
  score: number | null;
  completionPct: number | null;
  compliancePct: number | null;
  /** Runs that have come due: finished, or past their deadline. Runs still ahead are left out. */
  due: number;
  completed: number;
  missed: number;
  submitted: number;
  approved: number;
}
/** Completion is the share of due items done; compliance is the share done on time. */
export interface TicketScore { score: number | null; completionPct: number | null; compliancePct: number | null; due: number; closed: number; onTime: number; late: number }
export interface DelegationScore { score: number | null; completionPct: number | null; compliancePct: number | null; due: number; done: number; onTime: number; overdue: number }

export interface Scores {
  scope: ScoreScope;
  id: string;
  name: string;
  from: string;
  to: string;
  checklist: ChecklistScore;
  ticket: TicketScore;
  delegation: DelegationScore;
}

export interface TrendBucket {
  label: string;
  from: string;
  to: string;
  checklist: ChecklistScore;
  ticket: TicketScore;
  delegation: DelegationScore;
}

export interface ScoreTrend {
  scope: ScoreScope;
  id: string;
  name: string;
  period: TrendPeriod;
  buckets: TrendBucket[];
}

export interface ScoreReportRow {
  id: string;
  name: string;
  department: string;
  role?: string;
  checklist: ChecklistScore;
  ticket: TicketScore;
  delegation: DelegationScore;
}

export interface ScoreReport {
  from: string;
  to: string;
  generatedAt: string;
  departments: ScoreReportRow[];
  people: ScoreReportRow[];
  /** Only filled when asked for (`stores: true`) and only for Admin and PC. */
  stores: ScoreReportRow[];
  notes: string[];
}

/** `from` and `to` are calendar days, YYYY-MM-DD, both included. A person without `id` is the caller. */
export const scoreApi = {
  get: (params: { scope: ScoreScope; id?: string; from: string; to: string }) => {
    const query = new URLSearchParams({ scope: params.scope, from: params.from, to: params.to });
    if (params.id) query.set('id', params.id);
    return apiFetch<{ success: boolean; data: Scores }>(`/scores?${query.toString()}`).then((r) => r.data);
  },
  /** The same scores cut into a few buckets over the window, for the Trend view. */
  trend: (params: { scope: ScoreScope; id?: string; period: TrendPeriod; from: string; to: string }) => {
    const query = new URLSearchParams({ scope: params.scope, period: params.period, from: params.from, to: params.to });
    if (params.id) query.set('id', params.id);
    return apiFetch<{ success: boolean; data: ScoreTrend }>(`/scores/trend?${query.toString()}`).then((r) => r.data);
  },
  /** Every department and person the caller may see (Admin, PC, department heads), optionally every store. */
  report: (params: { from: string; to: string; stores?: boolean }) => {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    if (params.stores) query.set('stores', '1');
    return apiFetch<{ success: boolean; data: ScoreReport }>(`/scores/report?${query.toString()}`).then((r) => r.data);
  },
};
