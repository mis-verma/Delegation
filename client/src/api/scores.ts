import { apiFetch } from './http';

export type ScoreScope = 'person' | 'department' | 'store';

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
export interface TicketScore { score: number | null; due: number; onTime: number; late: number }
export interface DelegationScore { score: number | null; due: number; done: number; overdue: number }

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
  notes: string[];
}

/** `from` and `to` are calendar days, YYYY-MM-DD, both included. A person without `id` is the caller. */
export const scoreApi = {
  get: (params: { scope: ScoreScope; id?: string; from: string; to: string }) => {
    const query = new URLSearchParams({ scope: params.scope, from: params.from, to: params.to });
    if (params.id) query.set('id', params.id);
    return apiFetch<{ success: boolean; data: Scores }>(`/scores?${query.toString()}`).then((r) => r.data);
  },
  /** Every department and person the caller may see (Admin, PC, department heads). */
  report: (params: { from: string; to: string }) =>
    apiFetch<{ success: boolean; data: ScoreReport }>(`/scores/report?${new URLSearchParams(params).toString()}`).then((r) => r.data),
};
