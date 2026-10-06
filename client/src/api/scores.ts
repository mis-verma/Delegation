import { apiFetch } from './http';

export interface PersonScores {
  userId: string;
  name: string;
  from: string;
  to: string;
  checklist: { score: number | null; completionPct: number | null; compliancePct: number | null; assigned: number; completed: number; missed: number; submitted: number; approved: number };
  ticket: { score: number | null; due: number; onTime: number; late: number };
  delegation: { score: number | null; due: number; done: number; overdue: number };
}

/** `from` and `to` are calendar days, YYYY-MM-DD, both included. Without `userId` it is the caller's own. */
export const scoreApi = {
  person: (params: { userId?: string; from: string; to: string }) => {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    if (params.userId) query.set('userId', params.userId);
    return apiFetch<{ success: boolean; data: PersonScores }>(`/scores/person?${query.toString()}`).then((r) => r.data);
  },
};
