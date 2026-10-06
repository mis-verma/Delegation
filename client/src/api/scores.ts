import { apiFetch } from './http';

export type ScoreScope = 'person' | 'department' | 'store';

export interface Scores {
  scope: ScoreScope;
  id: string;
  name: string;
  from: string;
  to: string;
  checklist: { score: number | null; completionPct: number | null; compliancePct: number | null; assigned: number; completed: number; missed: number; submitted: number; approved: number };
  ticket: { score: number | null; due: number; onTime: number; late: number };
  delegation: { score: number | null; due: number; done: number; overdue: number };
}

/** `from` and `to` are calendar days, YYYY-MM-DD, both included. A person without `id` is the caller. */
export const scoreApi = {
  get: (params: { scope: ScoreScope; id?: string; from: string; to: string }) => {
    const query = new URLSearchParams({ scope: params.scope, from: params.from, to: params.to });
    if (params.id) query.set('id', params.id);
    return apiFetch<{ success: boolean; data: Scores }>(`/scores?${query.toString()}`).then((r) => r.data);
  },
};
